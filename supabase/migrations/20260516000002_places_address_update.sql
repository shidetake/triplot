-- places: 住所スナップショット追加 + 検索由来必須化 + update_place RPC
--
-- 変更:
--  - places に formatted_address を追加（保存時に Google の住所をスナップショット。
--    保存済みピンの閲覧で Google を呼ばずに済ませる＝課金 $0 にするため）。
--  - 場所は必ず Google 検索結果由来になった（手動座標入力を廃止）ので
--    google_place_id / lat / lng / formatted_address を NOT NULL 化。
--    「UI で省略不可・常に Google から導出して埋まる」ならスキーマも固くする方針。
--  - create_place に p_formatted_address を追加（旧 8 引数版は drop して置換）。
--  - update_place RPC 新設。編集できるのは status / visibility / note のみ。
--    地点そのもの（Google 由来カラム）は不変。private は作成者のみ、
--    shared→private も作成者のみ（RLS の places_update と同条件をなぞる）。
--
-- 開発中のため backfill は書かない。NOT NULL を足すため先頭で places を一掃する。
-- events.place_id は on delete set null だが truncate cascade では events も
-- truncate される。dev データなので可とする。

-- ────────────────────────────────────────────────────────────
-- 既存 places 一掃（NOT NULL 追加のため。dev 運用）
-- ────────────────────────────────────────────────────────────
truncate table places cascade;

-- ────────────────────────────────────────────────────────────
-- places: 住所スナップショット + Google 由来カラムを NOT NULL 化
-- ────────────────────────────────────────────────────────────
alter table places add column formatted_address text not null;

alter table places alter column google_place_id set not null;
alter table places alter column lat             set not null;
alter table places alter column lng             set not null;

-- ────────────────────────────────────────────────────────────
-- create_place: p_formatted_address を追加（引数が変わるので旧版を drop）
-- ────────────────────────────────────────────────────────────
drop function if exists public.create_place(
  text, text, uuid, text, text, text, double precision, double precision
);

create or replace function public.create_place(
  p_trip_id           text,
  p_name              text,
  p_status_id         uuid,
  p_visibility        text,
  p_note              text,
  p_google_place_id   text,
  p_lat               double precision,
  p_lng               double precision,
  p_formatted_address text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid           uuid := auth.uid();
  v_my_member_id  uuid;
  v_place_id      uuid;
  v_status_ok     boolean;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'name required';
  end if;
  if coalesce(trim(p_formatted_address), '') = '' then
    raise exception 'address required';
  end if;
  if coalesce(trim(p_google_place_id), '') = '' then
    raise exception 'google_place_id required';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'coordinates required';
  end if;
  if p_visibility not in ('shared', 'private') then
    raise exception 'invalid visibility';
  end if;

  select id into v_my_member_id
  from trip_members
  where trip_id = p_trip_id
    and user_id = v_uid
    and left_at is null;

  if v_my_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  select exists (
    select 1 from place_statuses
    where id = p_status_id
      and trip_id = p_trip_id
  ) into v_status_ok;

  if not v_status_ok then
    raise exception 'status does not belong to this trip';
  end if;

  insert into places (
    trip_id, created_by_member_id, visibility, google_place_id,
    name, lat, lng, status_id, note, formatted_address
  )
  values (
    p_trip_id, v_my_member_id, p_visibility,
    trim(p_google_place_id),
    trim(p_name), p_lat, p_lng, p_status_id,
    nullif(trim(coalesce(p_note, '')), ''),
    trim(p_formatted_address)
  )
  returning id into v_place_id;

  update trips set last_activity_at = now() where id = p_trip_id;

  return v_place_id;
end;
$body$;

revoke all on function public.create_place(
  text, text, uuid, text, text, text, double precision, double precision, text
) from public;
grant execute on function public.create_place(
  text, text, uuid, text, text, text, double precision, double precision, text
) to authenticated;

-- ────────────────────────────────────────────────────────────
-- update_place: status / visibility / note のみ更新。
-- 地点（Google 由来カラム）は不変。SECURITY DEFINER で RLS を
-- バイパスするため、places_update ポリシーと同じ条件を関数内で再現する。
-- ────────────────────────────────────────────────────────────
create or replace function public.update_place(
  p_place_id    uuid,
  p_status_id   uuid,
  p_visibility  text,
  p_note        text
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid        uuid := auth.uid();
  v_trip_id    text;
  v_creator    uuid;
  v_old_vis    text;
  v_is_member  boolean;
  v_is_creator boolean;
  v_status_ok  boolean;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_visibility not in ('shared', 'private') then
    raise exception 'invalid visibility';
  end if;

  select trip_id, created_by_member_id, visibility
    into v_trip_id, v_creator, v_old_vis
  from places
  where id = p_place_id;

  if v_trip_id is null then
    raise exception 'place not found';
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

  -- private は作成者のみ。shared→private も作成者のみ（非作成者による
  -- 横取り private 化を防ぐ。places_update の with check と同条件）。
  if (v_old_vis = 'private' or p_visibility = 'private') and not v_is_creator then
    raise exception 'not allowed to edit this place' using errcode = '42501';
  end if;

  select exists (
    select 1 from place_statuses
    where id = p_status_id and trip_id = v_trip_id
  ) into v_status_ok;

  if not v_status_ok then
    raise exception 'status does not belong to this trip';
  end if;

  update places
  set status_id  = p_status_id,
      visibility = p_visibility,
      note       = nullif(trim(coalesce(p_note, '')), '')
  where id = p_place_id;

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$body$;

revoke all on function public.update_place(uuid, uuid, text, text) from public;
grant execute on function public.update_place(uuid, uuid, text, text) to authenticated;
