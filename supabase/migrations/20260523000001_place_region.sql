-- 場所に地域(region=都道府県/州)と市(locality)を持たせる。
--
-- 用途: 地図の「クラスタチップ」のラベル。場所は地域名を直接持たないので、
-- Google Places の addressComponents から取れる administrative_area_level_1 を
-- region、locality を locality として保存時に1回だけ確定して格納する。
--  - 実行時の逆ジオコーディングはしない（呼び出し頻度・費用・名前の揺れを回避）。
--  - クラスタのラベルは「メンバー共通の region」を採るので、市レベルで持つより
--    揺れない（ホノルル↔カイルアで化けない＝全部「ハワイ」）。
--  - Google 由来でない場所（フリーテキスト/地図タップ）は region/locality 無し
--    (NULL)。クラスタは地理的距離で作るので NULL でも所属はできる。
--
-- どちらも nullable。既存データはテスト用なので backfill しない。

alter table places add column region   text;
alter table places add column locality text;

-- ────────────────────────────────────────────────────────────
-- find_or_create_trip_place: Google 由来の場所解決。p_region/p_locality 追加。
-- 新規作成・昇格時に格納し、再利用時は未設定なら補完（既存値は揺らさない）。
-- ────────────────────────────────────────────────────────────
drop function if exists public.find_or_create_trip_place(
  text, uuid, text, text, double precision, double precision, text, text
);

create or replace function public.find_or_create_trip_place(
  p_trip_id           text,
  p_member_id         uuid,
  p_google_place_id   text,
  p_name              text,
  p_lat               double precision,
  p_lng               double precision,
  p_formatted_address text,
  p_icon              text,
  p_region            text,
  p_locality          text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_gpid      text := nullif(trim(coalesce(p_google_place_id, '')), '');
  v_region    text := nullif(trim(coalesce(p_region, '')), '');
  v_locality  text := nullif(trim(coalesce(p_locality, '')), '');
  v_status_id uuid;
  v_place_id  uuid;
begin
  if v_gpid is null then
    raise exception 'google_place_id required';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name required';
  end if;
  if coalesce(trim(p_formatted_address), '') = '' then
    raise exception 'address required';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'coordinates required';
  end if;

  -- 1) 同一 gpid の shared place を再利用（最も確実な同一性）
  select id into v_place_id
  from places
  where trip_id = p_trip_id
    and google_place_id = v_gpid
    and visibility = 'shared'
  order by created_at
  limit 1;

  if v_place_id is not null then
    -- 地域が未設定なら今回の値で補完（既存値は揺らさない・無駄書きしない）
    update places
    set region   = coalesce(region, v_region),
        locality = coalesce(locality, v_locality)
    where id = v_place_id
      and (region is null or locality is null);
    return v_place_id;
  end if;

  -- 2) gpid 一致が無ければ、同名・未マップ・shared の既存を昇格して再利用
  select id into v_place_id
  from places
  where trip_id = p_trip_id
    and lat is null
    and visibility = 'shared'
    and lower(name) = lower(trim(p_name))
  order by created_at
  limit 1;

  if v_place_id is not null then
    update places
    set name              = trim(p_name),
        google_place_id   = v_gpid,
        lat               = p_lat,
        lng               = p_lng,
        formatted_address = trim(p_formatted_address),
        region            = coalesce(v_region, region),
        locality          = coalesce(v_locality, locality)
    where id = v_place_id;
    return v_place_id;
  end if;

  -- 3) どちらも無ければ確定（tentative=false）で新規作成
  select id into v_status_id
  from place_statuses
  where trip_id = p_trip_id
    and tentative = false
  order by sort_order
  limit 1;

  if v_status_id is null then
    raise exception 'confirmed status not found for this trip';
  end if;

  insert into places (
    trip_id, created_by_member_id, visibility, google_place_id,
    name, lat, lng, status_id, note, formatted_address, icon, region, locality
  )
  values (
    p_trip_id, p_member_id, 'shared', v_gpid,
    trim(p_name), p_lat, p_lng, v_status_id, null,
    trim(p_formatted_address),
    coalesce(nullif(trim(coalesce(p_icon, '')), ''), '📍'),
    v_region, v_locality
  )
  returning id into v_place_id;

  return v_place_id;
end;
$body$;

revoke all on function public.find_or_create_trip_place(
  text, uuid, text, text, double precision, double precision, text, text, text, text
) from public;

-- ────────────────────────────────────────────────────────────
-- create_place: 手動ピン/Google候補からの追加。p_region/p_locality 追加。
-- ────────────────────────────────────────────────────────────
drop function if exists public.create_place(
  text, text, uuid, text, text, text, double precision, double precision, text, text
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
  p_icon              text,
  p_region            text,
  p_locality          text
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
    name, lat, lng, status_id, note, formatted_address, icon, region, locality
  )
  values (
    p_trip_id, v_my_member_id, p_visibility,
    nullif(trim(coalesce(p_google_place_id, '')), ''),
    trim(p_name), p_lat, p_lng, p_status_id,
    nullif(trim(coalesce(p_note, '')), ''),
    nullif(trim(coalesce(p_formatted_address, '')), ''),
    coalesce(nullif(trim(coalesce(p_icon, '')), ''), '📍'),
    nullif(trim(coalesce(p_region, '')), ''),
    nullif(trim(coalesce(p_locality, '')), '')
  )
  returning id into v_place_id;

  update trips set last_activity_at = now() where id = p_trip_id;

  return v_place_id;
end;
$body$;

revoke all on function public.create_place(
  text, text, uuid, text, text, text, double precision, double precision, text, text, text, text
) from public;
grant execute on function public.create_place(
  text, text, uuid, text, text, text, double precision, double precision, text, text, text, text
) to authenticated;

-- ────────────────────────────────────────────────────────────
-- event/expense の _with_place ラッパ: p_region/p_locality を受けて
-- find_or_create_trip_place へ素通し。
-- ────────────────────────────────────────────────────────────
drop function if exists public.create_event_with_place(
  text, text, text, boolean, timestamp, timestamp, text, text, text, text,
  text, text, double precision, double precision, text, text
);

create or replace function public.create_event_with_place(
  p_trip_id           text,
  p_title             text,
  p_kind              text,
  p_all_day           boolean,
  p_start_at          timestamp,
  p_end_at            timestamp,
  p_start_tz          text,
  p_end_tz            text,
  p_visibility        text,
  p_note              text,
  p_google_place_id   text,
  p_place_name        text,
  p_lat               double precision,
  p_lng               double precision,
  p_formatted_address text,
  p_icon              text,
  p_region            text,
  p_locality          text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid        uuid := auth.uid();
  v_member_id  uuid;
  v_place_id   uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select id into v_member_id
  from trip_members
  where trip_id = p_trip_id
    and user_id = v_uid
    and left_at is null;

  if v_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  v_place_id := public.find_or_create_trip_place(
    p_trip_id, v_member_id, p_google_place_id, p_place_name,
    p_lat, p_lng, p_formatted_address, p_icon, p_region, p_locality
  );

  return public.create_event(
    p_trip_id, p_title, p_kind, p_all_day, p_start_at, p_end_at,
    p_start_tz, p_end_tz, v_place_id, p_visibility, p_note
  );
end;
$body$;

revoke all on function public.create_event_with_place(
  text, text, text, boolean, timestamp, timestamp, text, text, text, text,
  text, text, double precision, double precision, text, text, text, text
) from public;
grant execute on function public.create_event_with_place(
  text, text, text, boolean, timestamp, timestamp, text, text, text, text,
  text, text, double precision, double precision, text, text, text, text
) to authenticated;

drop function if exists public.update_event_with_place(
  uuid, text, text, boolean, timestamp, timestamp, text, text, text, text,
  text, text, double precision, double precision, text, text
);

create or replace function public.update_event_with_place(
  p_event_id          uuid,
  p_title             text,
  p_kind              text,
  p_all_day           boolean,
  p_start_at          timestamp,
  p_end_at            timestamp,
  p_start_tz          text,
  p_end_tz            text,
  p_visibility        text,
  p_note              text,
  p_google_place_id   text,
  p_place_name        text,
  p_lat               double precision,
  p_lng               double precision,
  p_formatted_address text,
  p_icon              text,
  p_region            text,
  p_locality          text
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid        uuid := auth.uid();
  v_trip_id    text;
  v_member_id  uuid;
  v_place_id   uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select trip_id into v_trip_id
  from events
  where id = p_event_id;

  if v_trip_id is null then
    raise exception 'event not found';
  end if;

  select id into v_member_id
  from trip_members
  where trip_id = v_trip_id
    and user_id = v_uid
    and left_at is null;

  if v_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  v_place_id := public.find_or_create_trip_place(
    v_trip_id, v_member_id, p_google_place_id, p_place_name,
    p_lat, p_lng, p_formatted_address, p_icon, p_region, p_locality
  );

  perform public.update_event(
    p_event_id, p_title, p_kind, p_all_day, p_start_at, p_end_at,
    p_start_tz, p_end_tz, v_place_id, p_visibility, p_note
  );
end;
$body$;

revoke all on function public.update_event_with_place(
  uuid, text, text, boolean, timestamp, timestamp, text, text, text, text,
  text, text, double precision, double precision, text, text, text, text
) from public;
grant execute on function public.update_event_with_place(
  uuid, text, text, boolean, timestamp, timestamp, text, text, text, text,
  text, text, double precision, double precision, text, text, text, text
) to authenticated;

drop function if exists public.create_expense_with_place(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, double precision, double precision, text, text, text
);

create or replace function public.create_expense_with_place(
  p_trip_id           text,
  p_local_price       numeric,
  p_local_currency    text,
  p_rate_to_default   numeric,
  p_category_id       uuid,
  p_payer_member_id   uuid,
  p_visibility        text,
  p_splittable        boolean,
  p_note              text,
  p_paid_at           timestamp,
  p_split_member_ids  uuid[],
  p_google_place_id   text,
  p_place_name        text,
  p_lat               double precision,
  p_lng               double precision,
  p_formatted_address text,
  p_icon              text,
  p_tz                text,
  p_region            text,
  p_locality          text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid        uuid := auth.uid();
  v_member_id  uuid;
  v_place_id   uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select id into v_member_id
  from trip_members
  where trip_id = p_trip_id
    and user_id = v_uid
    and left_at is null;

  if v_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  v_place_id := public.find_or_create_trip_place(
    p_trip_id, v_member_id, p_google_place_id, p_place_name,
    p_lat, p_lng, p_formatted_address, p_icon, p_region, p_locality
  );

  return public.create_expense(
    p_trip_id, p_local_price, p_local_currency, p_rate_to_default,
    p_category_id, p_payer_member_id, p_visibility, p_splittable,
    p_note, p_paid_at, p_split_member_ids, v_place_id, p_tz
  );
end;
$body$;

revoke all on function public.create_expense_with_place(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, double precision, double precision, text, text, text, text, text
) from public;
grant execute on function public.create_expense_with_place(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, double precision, double precision, text, text, text, text, text
) to authenticated;

drop function if exists public.update_expense_with_place(
  uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, double precision, double precision, text, text, text
);

create or replace function public.update_expense_with_place(
  p_expense_id        uuid,
  p_local_price       numeric,
  p_local_currency    text,
  p_rate_to_default   numeric,
  p_category_id       uuid,
  p_payer_member_id   uuid,
  p_visibility        text,
  p_splittable        boolean,
  p_note              text,
  p_paid_at           timestamp,
  p_split_member_ids  uuid[],
  p_google_place_id   text,
  p_place_name        text,
  p_lat               double precision,
  p_lng               double precision,
  p_formatted_address text,
  p_icon              text,
  p_tz                text,
  p_region            text,
  p_locality          text
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid        uuid := auth.uid();
  v_trip_id    text;
  v_member_id  uuid;
  v_place_id   uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select trip_id into v_trip_id
  from expenses
  where id = p_expense_id;

  if v_trip_id is null then
    raise exception 'expense not found';
  end if;

  select id into v_member_id
  from trip_members
  where trip_id = v_trip_id
    and user_id = v_uid
    and left_at is null;

  if v_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  v_place_id := public.find_or_create_trip_place(
    v_trip_id, v_member_id, p_google_place_id, p_place_name,
    p_lat, p_lng, p_formatted_address, p_icon, p_region, p_locality
  );

  perform public.update_expense(
    p_expense_id, p_local_price, p_local_currency, p_rate_to_default,
    p_category_id, p_payer_member_id, p_visibility, p_splittable,
    p_note, p_paid_at, p_split_member_ids, v_place_id, p_tz
  );
end;
$body$;

revoke all on function public.update_expense_with_place(
  uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, double precision, double precision, text, text, text, text, text
) from public;
grant execute on function public.update_expense_with_place(
  uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, double precision, double precision, text, text, text, text, text
) to authenticated;
