-- place_statuses テーブルを廃止し places.tentative boolean に一本化。
-- カスタマイズ UI は未実装で 2 固定値しか存在しない。boolean の方が単純。
-- 表示ラベルはフロント側 i18n カタログで翻訳する。

truncate table trips cascade;

-- ────────────────────────────────────────────────────────────
-- places: tentative 追加 / status_id 削除
-- ────────────────────────────────────────────────────────────
alter table places
  add column tentative boolean not null default true;

alter table places
  drop column status_id;

-- ────────────────────────────────────────────────────────────
-- place_statuses テーブル・seed 関数を廃止
-- ────────────────────────────────────────────────────────────
drop function if exists public.seed_default_place_statuses(text);
drop table if exists place_statuses;

-- ────────────────────────────────────────────────────────────
-- create_trip: seed_default_place_statuses の呼び出しを削除
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
  v_color int;
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
  if p_default_currency !~ '^[A-Z]{3}$' then
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

  v_color := pick_member_color(v_trip_id);

  insert into trip_members (trip_id, user_id, display_name, kind, color)
  values (v_trip_id, v_uid, p_display_name, 'member', v_color);

  perform public.seed_default_expense_categories(v_trip_id);

  return v_trip_id;
end;
$body$;

revoke all on function public.create_trip(text, date, date, text, text) from public;
grant execute on function public.create_trip(text, date, date, text, text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- find_or_create_trip_place: v_status_id ルックアップ → tentative 直接指定
-- ────────────────────────────────────────────────────────────
drop function if exists public.find_or_create_trip_place(
  text, uuid, text, text, double precision, double precision, text, text, text, text
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

  -- 1) 同一 gpid の shared place を再利用
  select id into v_place_id
  from places
  where trip_id = p_trip_id
    and google_place_id = v_gpid
    and visibility = 'shared'
  order by created_at
  limit 1;

  if v_place_id is not null then
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
  insert into places (
    trip_id, created_by_member_id, visibility, google_place_id,
    name, lat, lng, tentative, note, formatted_address, icon, region, locality
  )
  values (
    p_trip_id, p_member_id, 'shared', v_gpid,
    trim(p_name), p_lat, p_lng, false, null,
    trim(p_formatted_address),
    coalesce(nullif(trim(coalesce(p_icon, '')), ''), 'pin'),
    v_region, v_locality
  )
  returning id into v_place_id;

  return v_place_id;
end;
$body$;

-- ────────────────────────────────────────────────────────────
-- find_or_create_trip_freetext_place: place_statuses の確定 status 引きを
-- tentative=false の直接指定に置き換え（自由入力の場所は入れた時点で確定）
-- ────────────────────────────────────────────────────────────
create or replace function public.find_or_create_trip_freetext_place(
  p_trip_id    text,
  p_member_id  uuid,
  p_name       text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_name      text := nullif(trim(coalesce(p_name, '')), '');
  v_place_id  uuid;
begin
  if v_name is null then
    raise exception 'name required';
  end if;

  -- 同名・shared の既存を再利用（Google 由来でも可。マップ済みを優先）。
  -- 重複を作らない。逆順（Google 先 → 自由入力後）でも 1 つに収束する。
  select id into v_place_id
  from places
  where trip_id = p_trip_id
    and visibility = 'shared'
    and lower(name) = lower(v_name)
  order by (lat is not null) desc, created_at
  limit 1;

  if v_place_id is not null then
    return v_place_id;
  end if;

  -- 確定（tentative=false）。予定/費用に入れた時点で「行く/行った」は
  -- 確定済み（未確定なのは座標だけ）。Google 経路と揃え順序非依存にする。
  insert into places (
    trip_id, created_by_member_id, visibility, google_place_id,
    name, lat, lng, tentative, note, formatted_address, icon
  )
  values (
    p_trip_id, p_member_id, 'shared', null,
    v_name, null, null, false, null, null, 'pin'
  )
  returning id into v_place_id;

  return v_place_id;
end;
$body$;

revoke all on function public.find_or_create_trip_freetext_place(
  text, uuid, text
) from public;

-- ────────────────────────────────────────────────────────────
-- create_place: p_status_id uuid → p_tentative boolean
-- ────────────────────────────────────────────────────────────
drop function if exists public.create_place(
  text, text, uuid, text, text, text, double precision, double precision, text, text, text, text
);

create or replace function public.create_place(
  p_trip_id           text,
  p_name              text,
  p_tentative         boolean,
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

  insert into places (
    trip_id, created_by_member_id, visibility, google_place_id,
    name, lat, lng, tentative, note, formatted_address, icon, region, locality
  )
  values (
    p_trip_id, v_my_member_id, p_visibility,
    nullif(trim(coalesce(p_google_place_id, '')), ''),
    trim(p_name), p_lat, p_lng, coalesce(p_tentative, true),
    nullif(trim(coalesce(p_note, '')), ''),
    nullif(trim(coalesce(p_formatted_address, '')), ''),
    coalesce(nullif(trim(coalesce(p_icon, '')), ''), 'pin'),
    nullif(trim(coalesce(p_region, '')), ''),
    nullif(trim(coalesce(p_locality, '')), '')
  )
  returning id into v_place_id;

  update trips set last_activity_at = now() where id = p_trip_id;

  return v_place_id;
end;
$body$;

revoke all on function public.create_place(
  text, text, boolean, text, text, text, double precision, double precision, text, text, text, text
) from public;
grant execute on function public.create_place(
  text, text, boolean, text, text, text, double precision, double precision, text, text, text, text
) to authenticated;

-- ────────────────────────────────────────────────────────────
-- update_place: p_status_id uuid → p_tentative boolean
-- ────────────────────────────────────────────────────────────
drop function if exists public.update_place(uuid, uuid, text, text, text);

create or replace function public.update_place(
  p_place_id   uuid,
  p_tentative  boolean,
  p_visibility text,
  p_note       text,
  p_icon       text
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

  update places
  set tentative  = p_tentative,
      visibility = p_visibility,
      note       = nullif(trim(coalesce(p_note, '')), ''),
      icon       = coalesce(nullif(trim(coalesce(p_icon, '')), ''), 'pin')
  where id = p_place_id;

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$body$;

revoke all on function public.update_place(uuid, boolean, text, text, text) from public;
grant execute on function public.update_place(uuid, boolean, text, text, text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- copy_trip: place_statuses のコピーを撤去、tentative を直接コピー
-- ────────────────────────────────────────────────────────────
drop function if exists public.copy_trip(text, text, date, date, text, text, jsonb);

create or replace function public.copy_trip(
  p_source_trip_id  text,
  p_title           text,
  p_start_date      date,
  p_end_date        date,
  p_default_currency text,
  p_display_name    text,
  p_events          jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid       uuid := auth.uid();
  v_trip_id   text;
  v_member_id uuid;
  v_new_id    uuid;
  v_place_map jsonb := '{}';
  v_new_place uuid;
  v_place_key text;
  r           record;
  ev          jsonb;
  v_attempts  int := 0;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if coalesce(trim(p_title), '') = '' then
    raise exception 'title required';
  end if;
  if coalesce(trim(p_display_name), '') = '' then
    raise exception 'display_name required';
  end if;
  if p_default_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid default_currency';
  end if;

  -- コピー元の trip に所属しているか確認
  if not exists (
    select 1 from trip_members
    where trip_id = p_source_trip_id
      and user_id = v_uid
      and left_at is null
  ) then
    raise exception 'errors.notTripMember' using errcode = '42501';
  end if;

  -- コピー元が存在するか確認
  if not exists (select 1 from trips where id = p_source_trip_id) then
    raise exception 'errors.tripCopySourceNotFound';
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
        raise exception 'errors.copyFailed';
      end if;
    end;
  end loop;

  insert into trip_members (trip_id, user_id, display_name, kind)
  values (v_trip_id, v_uid, p_display_name, 'member')
  returning id into v_member_id;

  -- 費用カテゴリとピンは既定 seed（費用はコピーしないので既定でよい）。
  perform public.seed_default_expense_categories(v_trip_id);
  perform public.seed_default_trip_pin_options(v_trip_id);

  -- shared な places を全部複製（候補も確定も）。tentative を直接コピー。
  for r in
    select id, name, tentative, lat, lng, google_place_id, formatted_address,
           region, locality, note, icon
    from places
    where trip_id = p_source_trip_id and visibility = 'shared'
    order by created_at
  loop
    insert into places (
      trip_id, name, tentative, lat, lng, google_place_id, formatted_address,
      region, locality, visibility, note, icon, created_by_member_id
    )
    values (
      v_trip_id, r.name, r.tentative, r.lat, r.lng, r.google_place_id, r.formatted_address,
      r.region, r.locality, 'shared', r.note, r.icon, v_member_id
    )
    returning id into v_new_id;
    v_place_map := v_place_map || jsonb_build_object(r.id::text, v_new_id::text);
  end loop;

  -- 予定を挿入（日付は TS でリマップ済み）。place 参照は元 id → 新 id へ付け替え。
  for ev in select * from jsonb_array_elements(coalesce(p_events, '[]'::jsonb))
  loop
    v_place_key := ev->>'place_id';
    if v_place_key is null then
      v_new_place := null;
    else
      v_new_place := nullif(v_place_map->>v_place_key, '')::uuid;
    end if;

    insert into events (
      trip_id, created_by_member_id, visibility, kind, all_day,
      title, start_at, end_at, start_tz, end_tz, place_id, note
    )
    values (
      v_trip_id, v_member_id, 'shared',
      ev->>'kind', coalesce((ev->>'all_day')::boolean, false),
      ev->>'title',
      (ev->>'start_at')::timestamp,
      (ev->>'end_at')::timestamp,
      ev->>'start_tz',
      ev->>'end_tz',
      v_new_place,
      nullif(trim(coalesce(ev->>'note', '')), '')
    );
  end loop;

  return v_trip_id;
end;
$body$;

revoke all on function public.copy_trip(text, text, date, date, text, text, jsonb) from public;
grant execute on function public.copy_trip(text, text, date, date, text, text, jsonb) to authenticated;
