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
-- 既存メンバー色 + 確定ステータス色 (green ~140°) から色相環で最も離れた色を
-- 選ぶ。
-- 1人目: green から一番遠い (pink あたり)
-- 2人目: 1人目 + green から一番遠い (indigo あたり)
-- ...
-- 少人数なら明確に区別できる色が当たる。大人数になると詰まる（許容）。
-- パレットには green 系 (green/emerald) を含めない方針 → 確定 status と
-- 別物に保つ。teal は緑寄りだが色相 175° で green 140° から 35° 離れるので OK。
-- ────────────────────────────────────────────────────────────
create or replace function public.pick_member_color(p_trip_id text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $body$
declare
  -- Tailwind 色名と対応する色相 (度)。配列の i 番目同士が対応。
  -- green (140°) は確定ステータス専用なのでパレットから外す。
  -- emerald (155°) も green と隣接で見分けにくいので除外。
  palette text[] := array[
    'red', 'orange', 'amber', 'yellow', 'lime',
    'teal', 'cyan', 'sky', 'blue',
    'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'
  ];
  hues int[] := array[
    0, 25, 40, 55, 75,
    175, 190, 205, 220,
    235, 265, 275, 295, 330, 345
  ];
  reserved_hues int[] := array[140]; -- 確定ステータス (green-600)
  used_colors text[];
  used_hues int[];
  best_color text := palette[1];
  best_dist int := -1;
  i int;
  cand_hue int;
  uh int;
  d int;
  min_d int;
begin
  -- 既存アクティブメンバーの色を集める
  select coalesce(array_agg(color), array[]::text[])
    into used_colors
  from trip_members
  where trip_id = p_trip_id and left_at is null and color is not null;

  -- 距離計算の比較対象: 既存メンバー色の hue + 確定 (green)
  used_hues := reserved_hues;
  for i in 1..array_length(palette, 1) loop
    if palette[i] = any(used_colors) then
      used_hues := used_hues || hues[i];
    end if;
  end loop;

  -- 未使用色の中から「used_hues 全体への最小距離」が最大のものを選ぶ
  for i in 1..array_length(palette, 1) loop
    if palette[i] = any(used_colors) then continue; end if;
    cand_hue := hues[i];

    min_d := 360;
    foreach uh in array used_hues loop
      d := abs(cand_hue - uh);
      if d > 180 then d := 360 - d; end if;
      if d < min_d then min_d := d; end if;
    end loop;

    if min_d > best_dist then
      best_dist := min_d;
      best_color := palette[i];
    end if;
  end loop;

  return best_color;
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
