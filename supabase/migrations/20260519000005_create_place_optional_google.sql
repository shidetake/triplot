-- create_place: 手動ピン（地図タップで任意地点に置く場所）を許容する。
--
-- 背景:
--  - これまで create_place は google_place_id / formatted_address 必須＝
--    「Google 検索由来のみ」だった。前ステップで places は gpid/住所が
--    nullable（CHECK で「gpid 有るなら座標+住所必須」）になったので、
--    座標だけ持つ手動ピンを作れるよう create_place を緩める。
--  - 必須は name と lat/lng（create_place 経由は常に地図上の点＝座標必須。
--    座標を持たない自由入力は find_or_create_trip_freetext_place 側）。
--  - gpid / 住所は任意。空なら NULL（NULL なら CHECK 上「Google 由来でない
--    手動ピン」として正当）。Google 候補からの追加経路は従来通り gpid/住所
--    を渡すので影響なし。
--
-- シグネチャ不変（create or replace。型再生成はノーチャーン）。

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
    nullif(trim(coalesce(p_google_place_id, '')), ''),
    trim(p_name), p_lat, p_lng, p_status_id,
    nullif(trim(coalesce(p_note, '')), ''),
    nullif(trim(coalesce(p_formatted_address, '')), ''),
    coalesce(nullif(trim(coalesce(p_icon, '')), ''), 'pin')
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
