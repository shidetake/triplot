-- 招待リンクを「1旅行=1本・常に再表示できる・再生成で旧リンク失効」に作り直す。
--
-- 経緯: 当初は token_hash のみ保存（パスワード級の扱い）にしていたが、招待で
-- できるのは「旅行に参加」だけで過剰だった。Notion/Slack/GitHub 等と同じく、
-- リソースごとに1本の永続リンクをいつでも表示・コピーでき、再生成で旧リンクが
-- 即失効する形にする。多人数・無期限が既定（有効期限/人数上限は将来オプション）。
--
-- dev 方針につき backfill しない。ハッシュ→生トークンの作り替えのため一掃する。

-- 旧 API（ハッシュ前提）を破棄
drop function if exists public.create_trip_invite(text, text);
drop function if exists public.join_trip_via_invite(text, text);
drop function if exists public.peek_invite(text);

-- ────────────────────────────────────────────────────────────
-- trip_invites: 1旅行=1行。生トークンを保持（RLS で active member のみ
-- SELECT 可。join/peek は DEFINER RPC 経由なので非メンバーは読めない）。
-- ────────────────────────────────────────────────────────────
truncate table trip_invites;

alter table trip_invites drop column token_hash; -- PK だったので PK も落ちる
alter table trip_invites add column token text not null;
alter table trip_invites add constraint trip_invites_pkey primary key (trip_id);
alter table trip_invites add constraint trip_invites_token_key unique (token);

-- ────────────────────────────────────────────────────────────
-- ensure_trip_invite: 取得 or 初回発行（冪等）。アクティブメンバーのみ。
-- 既にあればそのトークンを返す（候補トークンは捨てる）。
-- ────────────────────────────────────────────────────────────
create or replace function public.ensure_trip_invite(
  p_trip_id  text,
  p_token    text
)
returns text
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid           uuid := auth.uid();
  v_my_member_id  uuid;
  v_token         text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if coalesce(trim(p_token), '') = '' then
    raise exception 'token required';
  end if;

  select id into v_my_member_id
  from trip_members
  where trip_id = p_trip_id and user_id = v_uid and left_at is null;

  if v_my_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  insert into trip_invites (trip_id, token, created_by_member_id)
  values (p_trip_id, p_token, v_my_member_id)
  on conflict (trip_id) do nothing;

  select token into v_token from trip_invites where trip_id = p_trip_id;
  return v_token;
end;
$body$;

revoke all on function public.ensure_trip_invite(text, text) from public;
grant execute on function public.ensure_trip_invite(text, text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- regenerate_trip_invite: トークンを差し替え（旧リンク即失効）。
-- ────────────────────────────────────────────────────────────
create or replace function public.regenerate_trip_invite(
  p_trip_id  text,
  p_token    text
)
returns text
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid           uuid := auth.uid();
  v_my_member_id  uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if coalesce(trim(p_token), '') = '' then
    raise exception 'token required';
  end if;

  select id into v_my_member_id
  from trip_members
  where trip_id = p_trip_id and user_id = v_uid and left_at is null;

  if v_my_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  insert into trip_invites (trip_id, token, created_by_member_id)
  values (p_trip_id, p_token, v_my_member_id)
  on conflict (trip_id) do update
    set token = excluded.token,
        created_at = now(),
        created_by_member_id = excluded.created_by_member_id;

  return p_token;
end;
$body$;

revoke all on function public.regenerate_trip_invite(text, text) from public;
grant execute on function public.regenerate_trip_invite(text, text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- join_trip_via_invite: トークンで trip を引き参加（upsert・退会復活）。
-- ────────────────────────────────────────────────────────────
create or replace function public.join_trip_via_invite(
  p_token        text,
  p_display_name text
)
returns text
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid       uuid := auth.uid();
  v_trip_id   text;
  v_name      text;
  v_anon      boolean;
  v_kind      text;
  v_member_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select trip_id into v_trip_id
  from trip_invites
  where token = p_token;

  if v_trip_id is null then
    raise exception 'invite not found';
  end if;

  v_name := nullif(trim(coalesce(p_display_name, '')), '');
  if v_name is null then
    v_name := 'ゲスト';
  end if;

  select is_anonymous into v_anon from users where id = v_uid;
  v_kind := case when coalesce(v_anon, true) then 'guest' else 'member' end;

  select id into v_member_id
  from trip_members
  where trip_id = v_trip_id and user_id = v_uid;

  if v_member_id is not null then
    update trip_members
    set left_at = null, display_name = v_name
    where id = v_member_id;
  else
    insert into trip_members (trip_id, user_id, display_name, kind)
    values (v_trip_id, v_uid, v_name, v_kind);
  end if;

  update trips set last_activity_at = now() where id = v_trip_id;

  return v_trip_id;
end;
$body$;

revoke all on function public.join_trip_via_invite(text, text) from public;
grant execute on function public.join_trip_via_invite(text, text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- peek_invite: 参加前プレビュー（旅行名のみ）。トークンを知る人だけ到達可。
-- ────────────────────────────────────────────────────────────
create or replace function public.peek_invite(
  p_token text
)
returns text
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_title text;
begin
  select t.title into v_title
  from trip_invites i
  join trips t on t.id = i.trip_id
  where i.token = p_token;

  return v_title;
end;
$body$;

revoke all on function public.peek_invite(text) from public;
grant execute on function public.peek_invite(text) to anon, authenticated;
