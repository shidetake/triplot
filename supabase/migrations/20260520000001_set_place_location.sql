-- set_place_location: 未マップ place（自由入力で名前だけ作られた場所）に
-- 後から地図で座標を設定する RPC。update_place は地点不変が意図なので
-- 別 RPC に分ける。
--
-- 対象は「lat IS NULL かつ google_place_id IS NULL」の place のみ:
--  - 既にマップ済み(lat NOT NULL): 二重設定にならないよう拒否（再配置は
--    将来別経路で）。
--  - Google 由来(gpid NOT NULL): 地点は Google が真実・不変。
--
-- 権限は update_place と同条件:
--  - 呼び出し者は trip のアクティブメンバー
--  - private は作成者のみ
--
-- 変更内容: lat / lng の埋め込みのみ。status / visibility / note / icon /
-- name は触らない（ユーザ設定を尊重）。formatted_address は手動ピンでは
-- 取らない（逆ジオコーディング課金 $0 の方針）。

create or replace function public.set_place_location(
  p_place_id  uuid,
  p_lat       double precision,
  p_lng       double precision
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid         uuid := auth.uid();
  v_trip_id     text;
  v_creator     uuid;
  v_vis         text;
  v_old_lat     double precision;
  v_gpid        text;
  v_is_member   boolean;
  v_is_creator  boolean;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_lat is null or p_lng is null then
    raise exception 'coordinates required';
  end if;

  select trip_id, created_by_member_id, visibility, lat, google_place_id
    into v_trip_id, v_creator, v_vis, v_old_lat, v_gpid
  from places
  where id = p_place_id;

  if v_trip_id is null then
    raise exception 'place not found';
  end if;

  if v_old_lat is not null then
    raise exception 'place is already located';
  end if;
  if v_gpid is not null then
    raise exception 'google-derived place location is immutable';
  end if;

  select exists (
    select 1 from trip_members
    where trip_id = v_trip_id and user_id = v_uid and left_at is null
  ) into v_is_member;

  if not v_is_member then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  select exists (
    select 1 from trip_members
    where id = v_creator and user_id = v_uid
  ) into v_is_creator;

  -- private は作成者のみ位置設定可（update_place / update_event と同条件）。
  if v_vis = 'private' and not v_is_creator then
    raise exception 'not allowed to edit this place' using errcode = '42501';
  end if;

  update places
  set lat = p_lat,
      lng = p_lng
  where id = p_place_id;

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$body$;

revoke all on function public.set_place_location(
  uuid, double precision, double precision
) from public;
grant execute on function public.set_place_location(
  uuid, double precision, double precision
) to authenticated;
