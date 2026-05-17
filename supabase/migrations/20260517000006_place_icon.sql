-- 地図ピンのアイコン（絵文字）を手動選択できるようにする。
--
-- icon はアプリ側で定義した固定パレットから1つ選んだ絵文字を保持するだけ
-- （trip ごとにユーザ管理する列挙ではないので独立テーブルにはしない）。
-- 未選択時は汎用ピン '📍'。create_place / update_place に p_icon を追加
-- （引数が変わるので旧版を drop して置換）。

alter table places add column icon text not null default '📍';

-- ────────────────────────────────────────────────────────────
-- create_place: p_icon を追加
-- ────────────────────────────────────────────────────────────
drop function if exists public.create_place(
  text, text, uuid, text, text, text, double precision, double precision, text
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
  p_formatted_address text,
  p_icon              text
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
    name, lat, lng, status_id, note, formatted_address, icon
  )
  values (
    p_trip_id, v_my_member_id, p_visibility,
    trim(p_google_place_id),
    trim(p_name), p_lat, p_lng, p_status_id,
    nullif(trim(coalesce(p_note, '')), ''),
    trim(p_formatted_address),
    coalesce(nullif(trim(coalesce(p_icon, '')), ''), '📍')
  )
  returning id into v_place_id;

  update trips set last_activity_at = now() where id = p_trip_id;

  return v_place_id;
end;
$body$;

revoke all on function public.create_place(
  text, text, uuid, text, text, text, double precision, double precision, text, text
) from public;
grant execute on function public.create_place(
  text, text, uuid, text, text, text, double precision, double precision, text, text
) to authenticated;

-- ────────────────────────────────────────────────────────────
-- update_place: status / visibility / note / icon を更新
-- ────────────────────────────────────────────────────────────
drop function if exists public.update_place(uuid, uuid, text, text);

create or replace function public.update_place(
  p_place_id    uuid,
  p_status_id   uuid,
  p_visibility  text,
  p_note        text,
  p_icon        text
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
      note       = nullif(trim(coalesce(p_note, '')), ''),
      icon       = coalesce(nullif(trim(coalesce(p_icon, '')), ''), '📍')
  where id = p_place_id;

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$body$;

revoke all on function public.update_place(uuid, uuid, text, text, text) from public;
grant execute on function public.update_place(uuid, uuid, text, text, text) to authenticated;
