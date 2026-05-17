-- 共有リンクの発行とゲスト参加。
--
-- 方針:
--  - 生トークンは保存しない。アプリ層（Node crypto）で乱数トークンを作り、
--    sha256 ハッシュだけ trip_invites.token_hash に入れる。URL には生トークン。
--  - 3 つの SECURITY DEFINER RPC で RLS をバイパスしつつ入口で認可:
--      create_trip_invite … 発行（アクティブメンバーのみ）
--      join_trip_via_invite … トークンハッシュ照合 → trip_members を upsert
--                              （退会済みなら復活）。kind は匿名=guest/他=member
--      peek_invite … 参加前に旅行名だけ見せる。トークンを知っている前提なので
--                     anon でも可（列挙耐性はトークンの秘匿性で担保）
--  - kind は RLS では区別しない（CLAUDE.md）。表示用の意味づけのみ。

-- ────────────────────────────────────────────────────────────
-- trip_invites: 発行メタを足す（誰がいつ）
-- ────────────────────────────────────────────────────────────
alter table trip_invites
  add column created_at timestamptz not null default now(),
  add column created_by_member_id uuid references trip_members(id) on delete set null;

-- ────────────────────────────────────────────────────────────
-- create_trip_invite: 招待ハッシュを 1 件登録（アクティブメンバーのみ）
-- ────────────────────────────────────────────────────────────
create or replace function public.create_trip_invite(
  p_trip_id     text,
  p_token_hash  text
)
returns void
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
  if coalesce(trim(p_token_hash), '') = '' then
    raise exception 'token required';
  end if;

  select id into v_my_member_id
  from trip_members
  where trip_id = p_trip_id
    and user_id = v_uid
    and left_at is null;

  if v_my_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  insert into trip_invites (trip_id, token_hash, created_by_member_id)
  values (p_trip_id, p_token_hash, v_my_member_id)
  on conflict (token_hash) do nothing;
end;
$body$;

revoke all on function public.create_trip_invite(text, text) from public;
grant execute on function public.create_trip_invite(text, text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- join_trip_via_invite: トークンハッシュで trip を引き、参加（upsert）。
-- 退会済み(left_at)なら復活。返り値は trip_id。
-- ────────────────────────────────────────────────────────────
create or replace function public.join_trip_via_invite(
  p_token_hash   text,
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
  where token_hash = p_token_hash;

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
    -- 既存（退会済み含む）→ 復活＋表示名更新
    update trip_members
    set left_at = null,
        display_name = v_name
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
-- peek_invite: 参加前プレビュー（旅行名のみ）。トークンを知っている人だけが
-- 到達できる前提。無効なら null。
-- ────────────────────────────────────────────────────────────
create or replace function public.peek_invite(
  p_token_hash text
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
  where i.token_hash = p_token_hash;

  return v_title;
end;
$body$;

revoke all on function public.peek_invite(text) from public;
grant execute on function public.peek_invite(text) to anon, authenticated;
