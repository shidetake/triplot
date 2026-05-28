-- ────────────────────────────────────────────────────────────
-- メンバー色の自動割当（色相環で最遠を選ぶ、preset 無し）
-- ────────────────────────────────────────────────────────────
-- 既存メンバーの色相 + 確定ステータスの green (140°) から「最小距離が最大」
-- になる hue (0-359) を選ぶ。0-359 を全探索（360 回程度の軽い処理）。
--   1人目: green の反対 → 320°
--   2人目: {140°, 320°} の最大ギャップの中点 → 50°
--   3人目: 残り 180° ギャップの中点 → 230°
--   ... 増えるほど詰まる、上限なし。
-- preset を持たず数値で扱うので、テーマカラーや Tailwind に依存しない。

create or replace function public.pick_member_color(p_trip_id text)
returns int
language plpgsql
stable
security definer
set search_path = public
as $body$
declare
  green_hue int := 140;
  used_hues int[];
  best_hue int := 0;
  best_dist int := -1;
  h int;
  uh int;
  d int;
  min_d int;
begin
  -- 既存メンバーの hue + 確定 green
  select coalesce(array_agg(color), array[]::int[])
    into used_hues
  from trip_members
  where trip_id = p_trip_id and left_at is null and color is not null;
  used_hues := used_hues || array[green_hue];

  -- 0..359 を全探索して最大 min-distance を選ぶ
  for h in 0..359 loop
    min_d := 360;
    foreach uh in array used_hues loop
      d := abs(h - uh);
      if d > 180 then d := 360 - d; end if;
      if d < min_d then min_d := d; end if;
    end loop;
    if min_d > best_dist then
      best_dist := min_d;
      best_hue := h;
    end if;
  end loop;

  return best_hue;
end;
$body$;

revoke all on function public.pick_member_color(text) from public;
grant execute on function public.pick_member_color(text) to authenticated;

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
  v_old_color  int;
  v_color      int;
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
    -- 衝突判定: hue が完全一致 (整数なので等価比較で十分。0..359 の精度は粗くないので
    -- 偶然完全一致はほぼ起きないが、起きたら付け直し)。
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
