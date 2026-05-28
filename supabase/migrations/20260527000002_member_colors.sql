-- ────────────────────────────────────────────────────────────
-- メンバー色の自動割当
-- ────────────────────────────────────────────────────────────
-- trip_members.color は initial_schema で text 列として用意済みだが未使用。
-- 8 色のパレットから「同 trip のアクティブメンバーが使ってない最初の色」を
-- 割り当てる。create_trip / join_trip_via_invite で自動セット。後から変更も可。
--
-- 既存データへの backfill は migration には書かない（CLAUDE.md 方針）。
-- 既存メンバーの color は NULL のまま、UI 側でフォールバック（zinc）表示し、
-- 編集 UI から色を選び直してもらう。

-- ────────────────────────────────────────────────────────────
-- パレットから未使用色を1つ返す。全部使い切ったら最初に戻る（フォールバック）。
-- stable: 同一 tx 内で複数回呼んでも入力に対し結果は一定として扱える。
-- ────────────────────────────────────────────────────────────
create or replace function public.pick_member_color(p_trip_id text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $body$
declare
  palette text[] := array[
    'red', 'amber', 'teal', 'blue', 'violet', 'pink'
  ];
  c text;
begin
  foreach c in array palette loop
    if not exists (
      select 1 from trip_members
      where trip_id = p_trip_id
        and color = c
        and left_at is null
    ) then
      return c;
    end if;
  end loop;
  -- 全色使い切ったら衝突容認でパレット先頭。8人超えは想定外。
  return palette[1];
end;
$body$;

revoke all on function public.pick_member_color(text) from public;
grant execute on function public.pick_member_color(text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- create_trip: 作成者メンバーに color を割当てるよう更新
-- （シグネチャは不変）
-- ────────────────────────────────────────────────────────────
create or replace function public.create_trip(
  p_title             text,
  p_start_date        date,
  p_end_date          date,
  p_default_currency  text,
  p_display_name      text
)
returns text
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid uuid := auth.uid();
  v_trip_id text;
  v_attempts int := 0;
begin
  if v_uid is null then
    raise exception 'authentication required'
      using errcode = '42501';
  end if;

  if coalesce(trim(p_title), '') = '' then
    raise exception 'title required';
  end if;
  if coalesce(trim(p_display_name), '') = '' then
    raise exception 'display_name required';
  end if;
  if p_default_currency not in ('JPY', 'USD') then
    raise exception 'invalid default_currency';
  end if;

  loop
    begin
      insert into trips (title, start_date, end_date, default_currency)
      values (p_title, p_start_date, p_end_date, p_default_currency)
      returning id into v_trip_id;
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 5 then
        raise exception 'failed to generate unique trip id after 5 attempts';
      end if;
    end;
  end loop;

  -- 作成者は trip 1人目なのでパレット先頭が割当たる。
  insert into trip_members (trip_id, user_id, display_name, kind, color)
  values (v_trip_id, v_uid, p_display_name, 'member',
          public.pick_member_color(v_trip_id));

  perform public.seed_default_expense_categories(v_trip_id);
  perform public.seed_default_place_statuses(v_trip_id);

  return v_trip_id;
end;
$body$;

-- ────────────────────────────────────────────────────────────
-- join_trip_via_invite: 新規参加に color を割当て。再参加（left_at 戻し）も
-- 色が他のアクティブメンバーと衝突してたら付け直す（衝突してなければ温存）。
-- （シグネチャは不変）
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
  v_uid        uuid := auth.uid();
  v_trip_id    text;
  v_name       text;
  v_anon       boolean;
  v_kind       text;
  v_member_id  uuid;
  v_old_color  text;
  v_color      text;
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

  select id, color into v_member_id, v_old_color
  from trip_members
  where trip_id = v_trip_id and user_id = v_uid;

  if v_member_id is not null then
    -- 再参加。色が他アクティブと衝突 or 未割当なら付け直す、それ以外は温存。
    if v_old_color is null or exists (
      select 1 from trip_members
      where trip_id = v_trip_id
        and id != v_member_id
        and color = v_old_color
        and left_at is null
    ) then
      v_color := public.pick_member_color(v_trip_id);
    else
      v_color := v_old_color;
    end if;
    update trip_members
    set left_at = null, display_name = v_name, color = v_color
    where id = v_member_id;
  else
    insert into trip_members (trip_id, user_id, display_name, kind, color)
    values (v_trip_id, v_uid, v_name, v_kind,
            public.pick_member_color(v_trip_id));
  end if;

  update trips set last_activity_at = now() where id = v_trip_id;

  return v_trip_id;
end;
$body$;
