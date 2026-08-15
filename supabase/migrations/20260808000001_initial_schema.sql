


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."assign_inbound_email_trip"("p_id" "uuid", "p_trip_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from inbound_emails where id = p_id and user_id = v_uid
  ) then
    raise exception 'draft not found';
  end if;
  if p_trip_id is not null and not public.is_active_trip_member(p_trip_id) then
    raise exception 'not a member of the trip' using errcode = '42501';
  end if;
  update inbound_emails
  set trip_id = p_trip_id
  where id = p_id and user_id = v_uid;
end;
$$;


ALTER FUNCTION "public"."assign_inbound_email_trip"("p_id" "uuid", "p_trip_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_dependent_tz_disambig"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update events
  set tz_disambig_transit_id = null,
      tz_disambig_side = null
  where tz_disambig_transit_id = old.id;

  update expenses
  set tz_disambig_transit_id = null,
      tz_disambig_side = null
  where tz_disambig_transit_id = old.id;

  return old;
end;
$$;


ALTER FUNCTION "public"."clear_dependent_tz_disambig"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_place_on_expense_link"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update places
  set tentative = false
  where id = new.place_id
    and tentative
    and trip_id = new.trip_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."confirm_place_on_expense_link"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_place_on_link"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update places
  set tentative = false
  where trip_id = new.trip_id
    and tentative
    and id in (
      -- events は2端点、expenses は1つ（下のトリガー定義で列を渡し分ける）。
      new.start_place_id, new.end_place_id
    );
  return new;
end;
$$;


ALTER FUNCTION "public"."confirm_place_on_link"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."copy_trip"("p_source_trip_id" "text", "p_title" "text", "p_start_date" "date", "p_end_date" "date", "p_default_currency" "text", "p_display_name" "text", "p_events" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid          uuid := auth.uid();
  v_trip_id      text;
  v_member_id    uuid;
  v_attempts     int := 0;
  v_place_map    jsonb := '{}'::jsonb;
  v_new_id       uuid;
  r              record;
  ev             jsonb;
  v_place_key    text;
  v_new_end_place uuid;
  v_new_place    uuid;
  v_src_default_tz text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (select 1 from trips where id = p_source_trip_id) then
    raise exception 'errors.tripCopySourceNotFound';
  end if;

  select default_timezone into v_src_default_tz
  from trips where id = p_source_trip_id;

  loop
    begin
      insert into trips (title, start_date, end_date, default_currency, default_timezone)
      values (p_title, p_start_date, p_end_date, p_default_currency, v_src_default_tz)
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

  perform public.seed_default_expense_categories(v_trip_id);
  perform public.seed_default_trip_pin_options(v_trip_id);

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

  for ev in select * from jsonb_array_elements(coalesce(p_events, '[]'::jsonb))
  loop
    v_place_key := ev->>'start_place_id';
    if v_place_key is null then
      v_new_place := null;
    else
      v_new_place := nullif(v_place_map->>v_place_key, '')::uuid;
    end if;
    v_place_key := ev->>'end_place_id';
    if v_place_key is null then
      v_new_end_place := null;
    else
      v_new_end_place := nullif(v_place_map->>v_place_key, '')::uuid;
    end if;

    insert into events (
      trip_id, created_by_member_id, visibility, kind, all_day,
      title, start_at, end_at, start_tz, end_tz,
      tz_disambig_transit_id, tz_disambig_side,
      start_place_id, end_place_id, note
    )
    values (
      v_trip_id, v_member_id, 'shared',
      ev->>'kind', coalesce((ev->>'all_day')::boolean, false),
      ev->>'title',
      (ev->>'start_at')::timestamp,
      (ev->>'end_at')::timestamp,
      ev->>'start_tz',
      ev->>'end_tz',
      null, null,
      v_new_place, v_new_end_place,
      nullif(trim(coalesce(ev->>'note', '')), '')
    );
  end loop;

  return v_trip_id;
end;
$$;


ALTER FUNCTION "public"."copy_trip"("p_source_trip_id" "text", "p_title" "text", "p_start_date" "date", "p_end_date" "date", "p_default_currency" "text", "p_display_name" "text", "p_events" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_event"("p_trip_id" "text", "p_title" "text", "p_kind" "text", "p_all_day" boolean, "p_start_at" timestamp without time zone, "p_end_at" timestamp without time zone, "p_start_tz" "text", "p_end_tz" "text", "p_tz_disambig_transit_id" "uuid", "p_tz_disambig_side" "text", "p_start_place" "jsonb", "p_end_place" "jsonb", "p_visibility" "text", "p_note" "text", "p_participant_member_ids" "uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid                  uuid := auth.uid();
  v_my_member_id         uuid;
  v_event_id             uuid;
  v_end_at               timestamp := p_end_at;
  v_end_tz               text;
  v_store_start_tz       text;
  v_disambig_transit_id  uuid;
  v_disambig_side        text;
  v_start_place_id       uuid;
  v_end_place_id         uuid;
  v_bad_count            int;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if coalesce(trim(p_title), '') = '' then
    raise exception 'title required';
  end if;
  if p_visibility not in ('shared', 'private') then
    raise exception 'invalid visibility';
  end if;
  if p_kind not in ('normal', 'transit') then
    raise exception 'invalid kind';
  end if;
  if p_start_at is null then
    raise exception 'start_at required';
  end if;

  if p_kind = 'transit' then
    if p_all_day then
      raise exception 'transit cannot be all-day';
    end if;
    if coalesce(trim(p_start_tz), '') = '' then
      raise exception 'start_tz required';
    end if;
    if p_end_at is null or coalesce(trim(p_end_tz), '') = '' then
      raise exception 'transit requires arrival time and timezone';
    end if;
    v_end_tz := trim(p_end_tz);
    v_store_start_tz := trim(p_start_tz);
    v_disambig_transit_id := null;
    v_disambig_side := null;
  else
    v_end_tz := null;
    v_store_start_tz := null;
    if p_all_day and v_end_at is null then
      v_end_at := p_start_at;
    end if;
    perform public.validate_tz_disambig(p_trip_id, p_tz_disambig_transit_id, p_tz_disambig_side);
    v_disambig_transit_id := p_tz_disambig_transit_id;
    v_disambig_side := p_tz_disambig_side;
  end if;

  if v_end_at is not null then
    if p_kind = 'transit' then
      if (v_end_at at time zone trim(p_end_tz))
           < (p_start_at at time zone trim(p_start_tz)) then
        raise exception 'errors.arrivalBeforeDeparture';
      end if;
    elsif v_end_at < p_start_at then
      raise exception 'end must be at or after start';
    end if;
  end if;

  select id into v_my_member_id
  from trip_members
  where trip_id = p_trip_id
    and user_id = v_uid
    and left_at is null;

  if v_my_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  v_start_place_id := public.resolve_place_spec(p_trip_id, v_my_member_id, p_start_place);
  v_end_place_id   := public.resolve_place_spec(p_trip_id, v_my_member_id, p_end_place);
  -- 同じ場所なら到着側は持たない（NULL = 開始と同じ）。
  if v_end_place_id is not distinct from v_start_place_id then
    v_end_place_id := null;
  end if;

  if p_visibility = 'shared'
     and p_participant_member_ids is not null
     and array_length(p_participant_member_ids, 1) > 0 then
    select count(*) into v_bad_count
    from unnest(p_participant_member_ids) as pid
    where not exists (
      select 1 from trip_members tm
      where tm.id = pid
        and tm.trip_id = p_trip_id
        and tm.left_at is null
    );
    if v_bad_count > 0 then
      raise exception 'invalid participant member';
    end if;
  end if;

  insert into events (
    trip_id, created_by_member_id, visibility, kind, all_day,
    title, start_at, end_at, start_tz, end_tz,
    tz_disambig_transit_id, tz_disambig_side,
    start_place_id, end_place_id, note
  )
  values (
    p_trip_id, v_my_member_id, p_visibility, p_kind, coalesce(p_all_day, false),
    trim(p_title), p_start_at, v_end_at, v_store_start_tz, v_end_tz,
    v_disambig_transit_id, v_disambig_side,
    v_start_place_id, v_end_place_id,
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_event_id;

  if p_visibility = 'shared'
     and p_participant_member_ids is not null
     and array_length(p_participant_member_ids, 1) > 0 then
    insert into event_participants (event_id, member_id)
    select v_event_id, m
    from unnest(p_participant_member_ids) as m;
  end if;

  update trips set last_activity_at = now() where id = p_trip_id;

  return v_event_id;
end;
$$;


ALTER FUNCTION "public"."create_event"("p_trip_id" "text", "p_title" "text", "p_kind" "text", "p_all_day" boolean, "p_start_at" timestamp without time zone, "p_end_at" timestamp without time zone, "p_start_tz" "text", "p_end_tz" "text", "p_tz_disambig_transit_id" "uuid", "p_tz_disambig_side" "text", "p_start_place" "jsonb", "p_end_place" "jsonb", "p_visibility" "text", "p_note" "text", "p_participant_member_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."default_place_icon_for_expense_category"("p_category_key" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  -- 費用カテゴリから「初めてその場所を登録するときだけ」の既定アイコンを出す。
  -- 既存の場所のアイコンには一切影響しない（呼び出し側が新規作成時にだけ使う）。
  -- 対応が明確なカテゴリのみ（無理に全カテゴリを当てにいかない）。ここで使う
  -- アイコンは全て trip_pin_options の既定14種の中（seed_default_trip_pin_options）
  -- ＝場所編集画面のアイコン選択にも必ず表示されている状態にする。
  select case p_category_key
    when 'dining' then 'food'
    when 'accommodation' then 'lodging'
    when 'flight' then 'airport'
    when 'local_transit' then 'station'
    when 'clothing' then 'shopping'
    when 'leisure' then 'activity'
    when 'souvenir' then 'shopping'
    when 'casino' then 'casino'
    else null
  end;
$$;


ALTER FUNCTION "public"."default_place_icon_for_expense_category"("p_category_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_expense"("p_trip_id" "text", "p_local_price" numeric, "p_local_currency" "text", "p_rate_to_default" numeric, "p_category_id" "uuid", "p_payer_member_id" "uuid", "p_visibility" "text", "p_splittable" boolean, "p_note" "text", "p_paid_at" timestamp without time zone, "p_split_member_ids" "uuid"[], "p_place" "jsonb", "p_tz_disambig_transit_id" "uuid", "p_tz_disambig_side" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid              uuid := auth.uid();
  v_my_member_id     uuid;
  v_expense_id       uuid;
  v_split_member_id  uuid;
  v_payer_ok         boolean;
  v_category_key     text;
  v_suggest_icon     text;
  v_place_id         uuid;
  v_paid_at          timestamp := coalesce(p_paid_at, (now() at time zone 'utc'));
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_local_price is null or p_local_price <= 0 then
    raise exception 'local_price must be positive';
  end if;
  if p_local_currency not in ('JPY', 'USD') then
    raise exception 'invalid local_currency';
  end if;
  if p_rate_to_default is null or p_rate_to_default <= 0 then
    raise exception 'rate_to_default must be positive';
  end if;
  if p_visibility not in ('shared', 'private') then
    raise exception 'invalid visibility';
  end if;
  if p_visibility = 'private' and p_splittable then
    raise exception 'private expense cannot be splittable';
  end if;

  perform public.validate_tz_disambig(p_trip_id, p_tz_disambig_transit_id, p_tz_disambig_side);

  select id into v_my_member_id
  from trip_members
  where trip_id = p_trip_id
    and user_id = v_uid
    and left_at is null;

  if v_my_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  select exists (
    select 1 from trip_members
    where id = p_payer_member_id
      and trip_id = p_trip_id
      and left_at is null
  ) into v_payer_ok;

  if not v_payer_ok then
    raise exception 'payer is not an active member of this trip';
  end if;

  select key into v_category_key
  from expense_categories
  where id = p_category_id
    and trip_id = p_trip_id;

  if not found then
    raise exception 'category does not belong to this trip';
  end if;

  -- 初めてその場所を登録するときだけ、費用カテゴリから既定アイコンを当てる
  -- （resolve_place_spec 経由の find_or_create_* は新規 insert のときしか
  -- icon を使わないので、既存の場所には影響しない）。
  v_suggest_icon := public.default_place_icon_for_expense_category(v_category_key);
  if v_suggest_icon is not null then
    if p_place ? 'google' and coalesce(p_place -> 'google' ->> 'icon', '') = '' then
      p_place := jsonb_set(p_place, '{google,icon}', to_jsonb(v_suggest_icon));
    elsif p_place ? 'freetext' and coalesce(p_place -> 'freetext' ->> 'icon', '') = '' then
      p_place := jsonb_set(p_place, '{freetext,icon}', to_jsonb(v_suggest_icon));
    end if;
  end if;

  -- 既存 id の trip 所属チェックも resolve_place_spec の中で行う。
  v_place_id := public.resolve_place_spec(p_trip_id, v_my_member_id, p_place);

  insert into expenses (
    trip_id, created_by_member_id, visibility, local_price, local_currency,
    rate_to_default, category_id, payer_member_id, splittable, note, paid_at,
    place_id, tz_disambig_transit_id, tz_disambig_side
  )
  values (
    p_trip_id, v_my_member_id, p_visibility, p_local_price, p_local_currency,
    p_rate_to_default, p_category_id, p_payer_member_id, p_splittable,
    nullif(trim(coalesce(p_note, '')), ''), v_paid_at,
    v_place_id, p_tz_disambig_transit_id, p_tz_disambig_side
  )
  returning id into v_expense_id;

  if p_splittable and p_split_member_ids is not null then
    foreach v_split_member_id in array p_split_member_ids loop
      if not exists (
        select 1 from trip_members
        where id = v_split_member_id
          and trip_id = p_trip_id
          and left_at is null
      ) then
        raise exception 'split member % is not an active member of this trip',
          v_split_member_id;
      end if;
      insert into expense_splits (expense_id, member_id)
      values (v_expense_id, v_split_member_id)
      on conflict do nothing;
    end loop;
  end if;

  update trips set last_activity_at = now() where id = p_trip_id;

  return v_expense_id;
end;
$$;


ALTER FUNCTION "public"."create_expense"("p_trip_id" "text", "p_local_price" numeric, "p_local_currency" "text", "p_rate_to_default" numeric, "p_category_id" "uuid", "p_payer_member_id" "uuid", "p_visibility" "text", "p_splittable" boolean, "p_note" "text", "p_paid_at" timestamp without time zone, "p_split_member_ids" "uuid"[], "p_place" "jsonb", "p_tz_disambig_transit_id" "uuid", "p_tz_disambig_side" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_place"("p_trip_id" "text", "p_name" "text", "p_tentative" boolean, "p_visibility" "text", "p_note" "text", "p_google_place_id" "text", "p_lat" double precision, "p_lng" double precision, "p_formatted_address" "text", "p_icon" "text", "p_region" "text", "p_locality" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."create_place"("p_trip_id" "text", "p_name" "text", "p_tentative" boolean, "p_visibility" "text", "p_note" "text", "p_google_place_id" "text", "p_lat" double precision, "p_lng" double precision, "p_formatted_address" "text", "p_icon" "text", "p_region" "text", "p_locality" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_todo"("p_trip_id" "text", "p_title" "text", "p_priority" "text", "p_kind" "text", "p_visibility" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid          uuid := auth.uid();
  v_my_member_id uuid;
  v_todo_id      uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'title required';
  end if;
  if p_priority not in ('high', 'medium', 'low') then
    raise exception 'invalid priority';
  end if;
  if p_kind not in ('prep', 'onsite') then
    raise exception 'invalid kind';
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

  insert into todos (trip_id, created_by_member_id, title, priority, kind, visibility)
  values (p_trip_id, v_my_member_id, trim(p_title), p_priority, p_kind, p_visibility)
  returning id into v_todo_id;

  update trips set last_activity_at = now() where id = p_trip_id;

  return v_todo_id;
end;
$$;


ALTER FUNCTION "public"."create_todo"("p_trip_id" "text", "p_title" "text", "p_priority" "text", "p_kind" "text", "p_visibility" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_trip"("p_title" "text", "p_start_date" "date", "p_end_date" "date", "p_default_currency" "text", "p_display_name" "text", "p_client_tz" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
  if p_default_currency not in ('JPY', 'USD') then
    raise exception 'invalid default_currency';
  end if;

  loop
    begin
      insert into trips (title, start_date, end_date, default_currency, default_timezone)
      values (
        p_title, p_start_date, p_end_date, p_default_currency,
        nullif(trim(p_client_tz), '')
      )
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

  insert into trip_members (trip_id, user_id, display_name, kind, color, is_admin)
  values (v_trip_id, v_uid, p_display_name, 'member', v_color, true);

  perform public.seed_default_expense_categories(v_trip_id);
  perform public.seed_default_trip_pin_options(v_trip_id);

  return v_trip_id;
end;
$$;


ALTER FUNCTION "public"."create_trip"("p_title" "text", "p_start_date" "date", "p_end_date" "date", "p_default_currency" "text", "p_display_name" "text", "p_client_tz" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dismiss_inbound_email"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  update inbound_drafts d
  set status = 'dismissed'
  from inbound_emails e
  where d.email_id = p_id and d.status = 'pending'
    and e.id = d.email_id and e.user_id = v_uid;
  perform finalize_inbound_email_if_resolved(p_id, v_uid);
end;
$$;


ALTER FUNCTION "public"."dismiss_inbound_email"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_import_token"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid      uuid := auth.uid();
  v_token    text;
  v_attempts int := 0;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select import_token into v_token from users where id = v_uid;
  if v_token is not null then
    return v_token;
  end if;

  loop
    begin
      v_token := lower(public.nanoid(16));
      update users set import_token = v_token where id = v_uid;
      return v_token;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 5 then
        raise exception 'failed to generate unique import token';
      end if;
    end;
  end loop;
end;
$$;


ALTER FUNCTION "public"."ensure_import_token"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_trip_invite"("p_trip_id" "text", "p_token" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid           uuid := auth.uid();
  v_my_member_id  uuid;
  v_token         text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if coalesce(trim(p_token), '') = '' then
    raise exception 'token required';
  end if;

  select id into v_my_member_id
  from trip_members
  where trip_id = p_trip_id and user_id = v_uid and left_at is null;

  if v_my_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  insert into trip_invites (trip_id, token, created_by_member_id)
  values (p_trip_id, p_token, v_my_member_id)
  on conflict (trip_id) do nothing;

  select token into v_token from trip_invites where trip_id = p_trip_id;
  return v_token;
end;
$$;


ALTER FUNCTION "public"."ensure_trip_invite"("p_trip_id" "text", "p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_inbound_email_if_resolved"("p_email_id" "uuid", "p_uid" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_pending   int;
  v_confirmed int;
begin
  select
    count(*) filter (where status = 'pending'),
    count(*) filter (where status = 'confirmed')
  into v_pending, v_confirmed
  from inbound_drafts
  where email_id = p_email_id;
  if v_pending > 0 then
    return;
  end if;
  update inbound_emails
  set status = case when v_confirmed > 0 then 'confirmed' else 'dismissed' end,
      raw = null,
      body_text = null
  where id = p_email_id and user_id = p_uid
    and status in ('extracted', 'error', 'over_quota');
  update inbound_emails
  set raw = null, body_text = null
  where merged_into = p_email_id and user_id = p_uid;
end;
$$;


ALTER FUNCTION "public"."finalize_inbound_email_if_resolved"("p_email_id" "uuid", "p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_or_create_trip_freetext_place"("p_trip_id" "text", "p_member_id" "uuid", "p_name" "text", "p_lat" double precision DEFAULT NULL::double precision, "p_lng" double precision DEFAULT NULL::double precision, "p_icon" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_name     text := nullif(trim(coalesce(p_name, '')), '');
  v_place_id uuid;
  v_has_geo  boolean := p_lat is not null and p_lng is not null;
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

  -- 空港だけ、名前が一致しなくても座標がほぼ同じ既存の空港ピンがあれば
  -- 同一の場所として丸める（先勝ち＝既存の名前・座標をそのまま使う）。
  -- メール取り込みで事前解決した空港名は英語（"Tokyo Narita"）で入るが、
  -- 手動でフライト番号確定すると日本語ロケールでは日本語名（"成田国際空港"）
  -- になり、表記違いだけで同じ空港が2件の別の場所として登録されてしまう
  -- （実機フィードバック）。他の自由入力（レストラン等）は表記揺れでの
  -- 誤爆を避けるため対象外にする。閾値 0.02 度（緯度で約2.2km）は「同じ
  -- 空港を別の提供元が返す中心点のズレ」を吸収できる程度に広く、別の POI
  -- との衝突は考えにくい範囲。
  if v_place_id is null and v_has_geo and p_icon = 'airport' then
    select id into v_place_id
    from places
    where trip_id = p_trip_id
      and visibility = 'shared'
      and icon = 'airport'
      and lat is not null and lng is not null
      and abs(lat - p_lat) < 0.02
      and abs(lng - p_lng) < 0.02
    order by created_at
    limit 1;
  end if;

  if v_place_id is not null then
    -- 座標を持たない既存に、分かった座標を後から与える。
    if v_has_geo then
      update places
      set lat  = p_lat,
          lng  = p_lng,
          icon = case when icon = 'pin' then coalesce(p_icon, icon) else icon end
      where id = v_place_id
        and lat is null;
    end if;
    return v_place_id;
  end if;

  insert into places (
    trip_id, created_by_member_id, visibility, name, lat, lng, icon
  )
  values (
    p_trip_id, p_member_id, 'shared', v_name,
    p_lat, p_lng, coalesce(p_icon, 'pin')
  )
  returning id into v_place_id;

  return v_place_id;
end;
$$;


ALTER FUNCTION "public"."find_or_create_trip_freetext_place"("p_trip_id" "text", "p_member_id" "uuid", "p_name" "text", "p_lat" double precision, "p_lng" double precision, "p_icon" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_or_create_trip_place"("p_trip_id" "text", "p_member_id" "uuid", "p_google_place_id" "text", "p_name" "text", "p_lat" double precision, "p_lng" double precision, "p_formatted_address" "text", "p_icon" "text", "p_region" "text", "p_locality" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."find_or_create_trip_place"("p_trip_id" "text", "p_member_id" "uuid", "p_google_place_id" "text", "p_name" "text", "p_lat" double precision, "p_lng" double precision, "p_formatted_address" "text", "p_icon" "text", "p_region" "text", "p_locality" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.users (id, is_anonymous, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.is_anonymous, false),
    -- フルネームの先頭の非空白トークン（半角/全角スペース区切り）。無ければ null。
    substring(
      trim(coalesce(
        nullif(trim(new.raw_user_meta_data->>'name'), ''),
        new.raw_user_meta_data->>'full_name',
        ''
      )) from '^[^[:space:]　]+'
    ),
    -- OAuth プロバイダのアバター URL（Google は avatar_url / picture のどちらか）。
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_trip_member"("_trip_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from trip_members
    where trip_id = _trip_id
      and user_id = auth.uid()
      and left_at is null
  );
$$;


ALTER FUNCTION "public"."is_active_trip_member"("_trip_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_app_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select is_admin from users where id = auth.uid()),
    false
  );
$$;


ALTER FUNCTION "public"."is_app_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_own_member"("_member_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from trip_members
    where id = _member_id and user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_own_member"("_member_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_trip_admin"("_trip_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from trip_members
    where trip_id = _trip_id
      and user_id = auth.uid()
      and left_at is null
      and is_admin = true
  );
$$;


ALTER FUNCTION "public"."is_trip_admin"("_trip_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_trip_via_invite"("p_token" "text", "p_display_name" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."join_trip_via_invite"("p_token" "text", "p_display_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."nanoid"("size" integer DEFAULT 10) RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  alphabet text := '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  result text := '';
  i int;
begin
  for i in 1..size loop
    result := result || substr(alphabet, 1 + floor(random() * 62)::int, 1);
  end loop;
  return result;
end;
$$;


ALTER FUNCTION "public"."nanoid"("size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."peek_invite"("p_token" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_title text;
begin
  select t.title into v_title
  from trip_invites i
  join trips t on t.id = i.trip_id
  where i.token = p_token;

  return v_title;
end;
$$;


ALTER FUNCTION "public"."peek_invite"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pick_member_color"("p_trip_id" "text") RETURNS integer
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."pick_member_color"("p_trip_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rebuild_inbound_drafts"("p_email_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_extracted jsonb;
begin
  select extracted into v_extracted from inbound_emails where id = p_email_id;
  delete from inbound_drafts where email_id = p_email_id and status = 'pending';
  if v_extracted is null then
    return;
  end if;
  if jsonb_typeof(v_extracted -> 'receipt') = 'object'
     and not exists (
       select 1 from inbound_drafts
       where email_id = p_email_id and kind = 'expense' and status = 'confirmed'
     ) then
    insert into inbound_drafts (email_id, kind, payload)
    values (p_email_id, 'expense', v_extracted -> 'receipt');
  end if;
  insert into inbound_drafts (email_id, kind, payload)
  select p_email_id, 'event', ev.value
  from jsonb_array_elements(coalesce(v_extracted -> 'events', '[]'::jsonb)) ev
  where not exists (
    select 1 from inbound_drafts d
    where d.email_id = p_email_id and d.kind = 'event'
      and d.status = 'confirmed' and d.payload = ev.value
  );
end;
$$;


ALTER FUNCTION "public"."rebuild_inbound_drafts"("p_email_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_receipt_link_candidate"("p_host" "text", "p_sample_url" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into receipt_link_candidates (host, sample_url)
  values (p_host, p_sample_url)
  on conflict (host) do update
    set seen_count = receipt_link_candidates.seen_count + 1,
        last_seen  = now(),
        sample_url = coalesce(receipt_link_candidates.sample_url, excluded.sample_url);
end;
$$;


ALTER FUNCTION "public"."record_receipt_link_candidate"("p_host" "text", "p_sample_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_receipt_link_candidate"("p_host" "text", "p_sample_url" "text" DEFAULT NULL::"text", "p_skipped_unsubscribe" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into receipt_link_candidates (host, sample_url, skipped_unsubscribe)
  values (p_host, p_sample_url, p_skipped_unsubscribe)
  on conflict (host) do update
    set seen_count = receipt_link_candidates.seen_count + 1,
        last_seen  = now(),
        sample_url = coalesce(receipt_link_candidates.sample_url, excluded.sample_url),
        -- 一度でも配信解除っぽいと報告されたら、以後もフラグを維持する（sticky）。
        skipped_unsubscribe =
          receipt_link_candidates.skipped_unsubscribe or excluded.skipped_unsubscribe;
end;
$$;


ALTER FUNCTION "public"."record_receipt_link_candidate"("p_host" "text", "p_sample_url" "text", "p_skipped_unsubscribe" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."regenerate_trip_invite"("p_trip_id" "text", "p_token" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid           uuid := auth.uid();
  v_my_member_id  uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if coalesce(trim(p_token), '') = '' then
    raise exception 'token required';
  end if;

  select id into v_my_member_id
  from trip_members
  where trip_id = p_trip_id and user_id = v_uid and left_at is null;

  if v_my_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  insert into trip_invites (trip_id, token, created_by_member_id)
  values (p_trip_id, p_token, v_my_member_id)
  on conflict (trip_id) do update
    set token = excluded.token,
        created_at = now(),
        created_by_member_id = excluded.created_by_member_id;

  return p_token;
end;
$$;


ALTER FUNCTION "public"."regenerate_trip_invite"("p_trip_id" "text", "p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_trip_member"("p_member_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid             uuid := auth.uid();
  v_trip_id         text;
  v_target_user     uuid;
  v_target_admin    boolean;
  v_caller_admin    boolean;
  v_caller_active   boolean;
  v_successor_id    uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select trip_id, user_id, is_admin
    into v_trip_id, v_target_user, v_target_admin
  from trip_members
  where id = p_member_id;

  if v_trip_id is null then
    raise exception 'member not found';
  end if;

  -- 呼び出し元がそのトリップのアクティブメンバーかつ admin か
  select left_at is null, coalesce(is_admin, false)
    into v_caller_active, v_caller_admin
  from trip_members
  where trip_id = v_trip_id and user_id = v_uid;

  if not coalesce(v_caller_active, false) then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  -- 他人を消すには admin が必要。自分自身（user_id 一致）は誰でも可。
  if v_target_user is distinct from v_uid and not v_caller_admin then
    raise exception 'admin required to remove other members' using errcode = '42501';
  end if;

  -- 消す対象が admin なら次の人に admin を移譲してから消す。
  -- 優先順: kind='member' を先に、その中で joined_at が古い順。
  if v_target_admin then
    select id into v_successor_id
    from trip_members
    where trip_id = v_trip_id
      and id != p_member_id
      and left_at is null
    order by (kind = 'guest') asc, joined_at asc
    limit 1;

    if v_successor_id is not null then
      update trip_members set is_admin = true where id = v_successor_id;
    end if;
    -- 後継が居ない（メンバーゼロになる）場合は admin は付かないまま。
    -- これは「最後の人が抜けて trip が空になる」状態で機能上問題なし。
  end if;

  update trip_members
  set left_at = now()
  where id = p_member_id and left_at is null;
end;
$$;


ALTER FUNCTION "public"."remove_trip_member"("p_member_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_inbound_draft"("p_id" "uuid", "p_status" "text", "p_expense_id" "uuid" DEFAULT NULL::"uuid", "p_event_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid      uuid := auth.uid();
  v_email_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_status not in ('confirmed', 'dismissed') then
    raise exception 'invalid status';
  end if;
  update inbound_drafts d
  set status = p_status,
      expense_id = case when p_status = 'confirmed' then p_expense_id else null end,
      event_id   = case when p_status = 'confirmed' then p_event_id else null end
  from inbound_emails e
  where d.id = p_id and d.status = 'pending'
    and e.id = d.email_id and e.user_id = v_uid
  returning d.email_id into v_email_id;
  if v_email_id is null then
    return;
  end if;
  perform finalize_inbound_email_if_resolved(v_email_id, v_uid);
end;
$$;


ALTER FUNCTION "public"."resolve_inbound_draft"("p_id" "uuid", "p_status" "text", "p_expense_id" "uuid", "p_event_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_place_spec"("p_trip_id" "text", "p_member_id" "uuid", "p_spec" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_place_id uuid;
  v_ok       boolean;
  v_google   jsonb;
  v_free     jsonb;
begin
  if p_spec is null or p_spec = 'null'::jsonb then
    return null;
  end if;

  if p_spec ? 'place_id' then
    v_place_id := (p_spec ->> 'place_id')::uuid;
    if v_place_id is null then
      return null;
    end if;
    select exists (
      select 1 from places where id = v_place_id and trip_id = p_trip_id
    ) into v_ok;
    if not v_ok then
      raise exception 'place does not belong to this trip';
    end if;
    return v_place_id;
  end if;

  if p_spec ? 'google' then
    v_google := p_spec -> 'google';
    return public.find_or_create_trip_place(
      p_trip_id,
      p_member_id,
      v_google ->> 'google_place_id',
      v_google ->> 'name',
      (v_google ->> 'lat')::double precision,
      (v_google ->> 'lng')::double precision,
      v_google ->> 'formatted_address',
      v_google ->> 'icon',
      v_google ->> 'region',
      v_google ->> 'locality'
    );
  end if;

  if p_spec ? 'freetext' then
    v_free := p_spec -> 'freetext';
    return public.find_or_create_trip_freetext_place(
      p_trip_id,
      p_member_id,
      v_free ->> 'name',
      (v_free ->> 'lat')::double precision,
      (v_free ->> 'lng')::double precision,
      nullif(v_free ->> 'icon', '')
    );
  end if;

  raise exception 'invalid place spec';
end;
$$;


ALTER FUNCTION "public"."resolve_place_spec"("p_trip_id" "text", "p_member_id" "uuid", "p_spec" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_default_expense_categories"("_trip_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into expense_categories (trip_id, name, color, icon, sort_order, key)
  values
    (_trip_id, '渡航',     '#3b82f6', 'flight',         1,  'flight'),
    (_trip_id, '現地移動', '#06b6d4', 'tram',           2,  'local_transit'),
    (_trip_id, '飲食',     '#f97316', 'restaurant',     3,  'dining'),
    (_trip_id, '衣服',     '#a855f7', 'checkroom',      4,  'clothing'),
    (_trip_id, 'レジャー', '#ec4899', 'local_activity', 5,  'leisure'),
    (_trip_id, '土産',     '#ef4444', 'redeem',         6,  'souvenir'),
    (_trip_id, '宿泊',     '#6366f1', 'hotel',          7,  'accommodation'),
    (_trip_id, '通信',     '#6b7280', 'wifi',           8,  'communication'),
    (_trip_id, '医療',     '#10b981', 'local_hospital', 9,  'medical'),
    (_trip_id, 'カジノ',   '#f59e0b', 'casino',         10, 'casino'),
    (_trip_id, 'その他',   '#71717a', 'category',       11, 'other'),
    -- 未分類 = 「分類していない」既定値（その他 = 「どれにも当てはまらないと
    -- 判断した」とは別物）。控えめな薄グレー。
    (_trip_id, '未分類',   '#a1a1aa', 'label_off',      12, 'uncategorized');
end;
$$;


ALTER FUNCTION "public"."seed_default_expense_categories"("_trip_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_default_trip_pin_options"("_trip_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into trip_pin_options (trip_id, icon, label, sort_order)
  values
    (_trip_id, 'pin',                 'その他',     0),
    (_trip_id, 'food',                '食事',       1),
    (_trip_id, 'cafe',                'カフェ',     2),
    (_trip_id, 'bar',                 'バー',       3),
    (_trip_id, 'shopping',            '買い物',     4),
    (_trip_id, 'local_grocery_store', 'スーパー',   5),
    (_trip_id, 'activity',            'レジャー',   6),
    (_trip_id, 'casino',              'カジノ',     7),
    (_trip_id, 'nature',              '自然・公園', 8),
    (_trip_id, 'sightseeing',         '観光・名所', 9),
    (_trip_id, 'lodging',             '宿',         10),
    (_trip_id, 'onsen',               '温泉',       11),
    (_trip_id, 'airport',             '空港',       12),
    (_trip_id, 'station',             '駅',         13);
end;
$$;


ALTER FUNCTION "public"."seed_default_trip_pin_options"("_trip_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_event_reservation"("p_event_id" "uuid", "p_needs" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid       uuid := auth.uid();
  v_trip_id   text;
  v_creator   uuid;
  v_vis       text;
  v_title     text;
  v_start_at  timestamp;
  v_is_member boolean;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select trip_id, created_by_member_id, visibility, title, start_at
    into v_trip_id, v_creator, v_vis, v_title, v_start_at
  from events
  where id = p_event_id;

  if v_trip_id is null then
    raise exception 'event not found';
  end if;

  select exists (
    select 1 from trip_members
    where trip_id = v_trip_id and user_id = v_uid and left_at is null
  ) into v_is_member;

  if not v_is_member then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  if not p_needs then
    delete from todos where event_id = p_event_id;
    return;
  end if;

  -- 既に予約TODOがあれば visibility だけ予定に追従させる（タイトル/優先度/done は保持）。
  -- 予定の公開範囲を shared↔private と変えたとき、予約TODOの可視範囲もズレないように同期する。
  if exists (select 1 from todos where event_id = p_event_id) then
    update todos set visibility = v_vis where event_id = p_event_id;
    return;
  end if;

  insert into todos (trip_id, created_by_member_id, title, priority, kind, visibility, event_id)
  values (
    v_trip_id, v_creator,
    to_char(v_start_at::date, 'FMMM/FMDD') || ' ' || v_title || 'の予約',
    'high', 'prep', v_vis, p_event_id
  );

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$$;


ALTER FUNCTION "public"."set_event_reservation"("p_event_id" "uuid", "p_needs" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_place_location"("p_place_id" "uuid", "p_lat" double precision, "p_lng" double precision) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
      lng = p_lng,
      location_dismissed = false
  where id = p_place_id;

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$$;


ALTER FUNCTION "public"."set_place_location"("p_place_id" "uuid", "p_lat" double precision, "p_lng" double precision) OWNER TO "postgres";


-- 未確定（自由入力）の場所を、地図上でタップ/検索して選んだ実在の Google の
-- 場所へ寄せる。選んだ場所が同じ旅行内で既に登録済み（google_place_id が一致）
-- なら、この place_id を参照している予定/費用をその既存の場所へ付け替えて
-- from 側を削除する（マージ）。まだ未登録なら、この行自体を Google の場所に
-- 昇格させる（id はそのまま＝参照している予定/費用は自動的に追従する）。
-- 店名がレシート由来の自由入力と大きく変わっても、ユーザーが地図上で明示的に
-- 選んだ場所を優先する（実装判断はプランに記載）。
CREATE OR REPLACE FUNCTION "public"."resolve_place_to_google"(
  "p_place_id" "uuid",
  "p_google_place_id" "text",
  "p_name" "text",
  "p_lat" double precision,
  "p_lng" double precision,
  "p_formatted_address" "text",
  "p_icon" "text",
  "p_region" "text",
  "p_locality" "text"
) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_trip_id      text;
  v_gpid         text := nullif(trim(coalesce(p_google_place_id, '')), '');
  v_existing_id  uuid;
begin
  if v_gpid is null then
    raise exception 'google_place_id required';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name required';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'coordinates required';
  end if;

  select trip_id into v_trip_id from places where id = p_place_id;
  if v_trip_id is null then
    raise exception 'place not found';
  end if;
  if not is_active_trip_member(v_trip_id) then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  select id into v_existing_id
  from places
  where trip_id = v_trip_id
    and google_place_id = v_gpid
    and visibility = 'shared'
    and id <> p_place_id
  order by created_at
  limit 1;

  if v_existing_id is not null then
    update events set start_place_id = v_existing_id where start_place_id = p_place_id;
    update events set end_place_id = v_existing_id where end_place_id = p_place_id;
    update expenses set place_id = v_existing_id where place_id = p_place_id;
    delete from places where id = p_place_id;
    update trips set last_activity_at = now() where id = v_trip_id;
    return v_existing_id;
  end if;

  update places
  set google_place_id   = v_gpid,
      name              = trim(p_name),
      lat               = p_lat,
      lng               = p_lng,
      formatted_address = trim(p_formatted_address),
      icon              = coalesce(nullif(trim(coalesce(p_icon, '')), ''), icon),
      region            = coalesce(nullif(trim(coalesce(p_region, '')), ''), region),
      locality          = coalesce(nullif(trim(coalesce(p_locality, '')), ''), locality),
      location_dismissed = false
  where id = p_place_id;

  update trips set last_activity_at = now() where id = v_trip_id;
  return p_place_id;
end;
$$;


ALTER FUNCTION "public"."resolve_place_to_google"("p_place_id" "uuid", "p_google_place_id" "text", "p_name" "text", "p_lat" double precision, "p_lng" double precision, "p_formatted_address" "text", "p_icon" "text", "p_region" "text", "p_locality" "text") OWNER TO "postgres";


-- 「地図未登録」バッジを今後出さないようにする（未確定のまま置いておきたい
-- 場所向け）。座標は付けない＝後から地図タブの編集フォームで改めて
-- 位置を設定することもできる（このフラグは一方的な通知の抑制に過ぎない）。
CREATE OR REPLACE FUNCTION "public"."dismiss_place_location"("p_place_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_trip_id text;
begin
  select trip_id into v_trip_id from places where id = p_place_id;
  if v_trip_id is null then
    raise exception 'place not found';
  end if;
  if not is_active_trip_member(v_trip_id) then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  update places set location_dismissed = true where id = p_place_id;
end;
$$;


ALTER FUNCTION "public"."dismiss_place_location"("p_place_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unmerge_inbound_email"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid    uuid := auth.uid();
  v_parent uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select merged_into into v_parent
  from inbound_emails
  where id = p_id and user_id = v_uid and status = 'merged';
  if v_parent is null then
    return;
  end if;
  update inbound_emails
  set status = 'extracted', merged_into = null
  where id = p_id and user_id = v_uid;
  perform rebuild_inbound_drafts(p_id);
  perform rebuild_inbound_drafts(v_parent);
end;
$$;


ALTER FUNCTION "public"."unmerge_inbound_email"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_event"("p_event_id" "uuid", "p_title" "text", "p_kind" "text", "p_all_day" boolean, "p_start_at" timestamp without time zone, "p_end_at" timestamp without time zone, "p_start_tz" "text", "p_end_tz" "text", "p_tz_disambig_transit_id" "uuid", "p_tz_disambig_side" "text", "p_start_place" "jsonb", "p_end_place" "jsonb", "p_visibility" "text", "p_note" "text", "p_participant_member_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid                 uuid := auth.uid();
  v_trip_id             text;
  v_creator             uuid;
  v_old_vis             text;
  v_is_member           boolean;
  v_is_creator          boolean;
  v_my_member_id        uuid;
  v_end_at              timestamp := p_end_at;
  v_end_tz              text;
  v_store_start_tz      text;
  v_disambig_transit_id uuid;
  v_disambig_side       text;
  v_start_place_id      uuid;
  v_end_place_id        uuid;
  v_bad_count           int;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if coalesce(trim(p_title), '') = '' then
    raise exception 'title required';
  end if;
  if p_visibility not in ('shared', 'private') then
    raise exception 'invalid visibility';
  end if;
  if p_kind not in ('normal', 'transit') then
    raise exception 'invalid kind';
  end if;
  if p_start_at is null then
    raise exception 'start_at required';
  end if;

  select trip_id, created_by_member_id, visibility
    into v_trip_id, v_creator, v_old_vis
  from events
  where id = p_event_id;

  if v_trip_id is null then
    raise exception 'event not found';
  end if;

  if p_kind = 'transit' then
    if p_all_day then
      raise exception 'transit cannot be all-day';
    end if;
    if coalesce(trim(p_start_tz), '') = '' then
      raise exception 'start_tz required';
    end if;
    if p_end_at is null or coalesce(trim(p_end_tz), '') = '' then
      raise exception 'transit requires arrival time and timezone';
    end if;
    v_end_tz := trim(p_end_tz);
    v_store_start_tz := trim(p_start_tz);
    v_disambig_transit_id := null;
    v_disambig_side := null;
  else
    v_end_tz := null;
    v_store_start_tz := null;
    if p_all_day and v_end_at is null then
      v_end_at := p_start_at;
    end if;
    perform public.validate_tz_disambig(v_trip_id, p_tz_disambig_transit_id, p_tz_disambig_side);
    v_disambig_transit_id := p_tz_disambig_transit_id;
    v_disambig_side := p_tz_disambig_side;
  end if;

  if v_end_at is not null then
    if p_kind = 'transit' then
      if (v_end_at at time zone trim(p_end_tz))
           < (p_start_at at time zone trim(p_start_tz)) then
        raise exception 'errors.arrivalBeforeDeparture';
      end if;
    elsif v_end_at < p_start_at then
      raise exception 'end must be at or after start';
    end if;
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
    raise exception 'not allowed to edit this event' using errcode = '42501';
  end if;

  select id into v_my_member_id
  from trip_members
  where trip_id = v_trip_id and user_id = v_uid and left_at is null;

  v_start_place_id := public.resolve_place_spec(v_trip_id, v_my_member_id, p_start_place);
  v_end_place_id   := public.resolve_place_spec(v_trip_id, v_my_member_id, p_end_place);
  if v_end_place_id is not distinct from v_start_place_id then
    v_end_place_id := null;
  end if;

  if p_visibility = 'shared'
     and p_participant_member_ids is not null
     and array_length(p_participant_member_ids, 1) > 0 then
    select count(*) into v_bad_count
    from unnest(p_participant_member_ids) as pid
    where not exists (
      select 1 from trip_members tm
      where tm.id = pid
        and tm.trip_id = v_trip_id
        and tm.left_at is null
    );
    if v_bad_count > 0 then
      raise exception 'invalid participant member';
    end if;
  end if;

  update events
  set title      = trim(p_title),
      kind       = p_kind,
      all_day    = coalesce(p_all_day, false),
      start_at   = p_start_at,
      end_at     = v_end_at,
      start_tz   = v_store_start_tz,
      end_tz     = v_end_tz,
      tz_disambig_transit_id = v_disambig_transit_id,
      tz_disambig_side       = v_disambig_side,
      start_place_id = v_start_place_id,
      end_place_id   = v_end_place_id,
      visibility = p_visibility,
      note       = nullif(trim(coalesce(p_note, '')), '')
  where id = p_event_id;

  delete from event_participants where event_id = p_event_id;
  if p_visibility = 'shared'
     and p_participant_member_ids is not null
     and array_length(p_participant_member_ids, 1) > 0 then
    insert into event_participants (event_id, member_id)
    select p_event_id, m
    from unnest(p_participant_member_ids) as m;
  end if;

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$$;


ALTER FUNCTION "public"."update_event"("p_event_id" "uuid", "p_title" "text", "p_kind" "text", "p_all_day" boolean, "p_start_at" timestamp without time zone, "p_end_at" timestamp without time zone, "p_start_tz" "text", "p_end_tz" "text", "p_tz_disambig_transit_id" "uuid", "p_tz_disambig_side" "text", "p_start_place" "jsonb", "p_end_place" "jsonb", "p_visibility" "text", "p_note" "text", "p_participant_member_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_expense"("p_expense_id" "uuid", "p_local_price" numeric, "p_local_currency" "text", "p_rate_to_default" numeric, "p_category_id" "uuid", "p_payer_member_id" "uuid", "p_visibility" "text", "p_splittable" boolean, "p_note" "text", "p_paid_at" timestamp without time zone, "p_split_member_ids" "uuid"[], "p_place" "jsonb", "p_tz_disambig_transit_id" "uuid", "p_tz_disambig_side" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid              uuid := auth.uid();
  v_trip_id          text;
  v_creator          uuid;
  v_old_vis          text;
  v_my_member_id     uuid;
  v_is_creator       boolean;
  v_payer_ok         boolean;
  v_category_key     text;
  v_suggest_icon     text;
  v_place_id         uuid;
  v_split_member_id  uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_local_price is null or p_local_price <= 0 then
    raise exception 'local_price must be positive';
  end if;
  if p_local_currency not in ('JPY', 'USD') then
    raise exception 'invalid local_currency';
  end if;
  if p_rate_to_default is null or p_rate_to_default <= 0 then
    raise exception 'rate_to_default must be positive';
  end if;
  if p_visibility not in ('shared', 'private') then
    raise exception 'invalid visibility';
  end if;
  if p_visibility = 'private' and p_splittable then
    raise exception 'private expense cannot be splittable';
  end if;

  select trip_id, created_by_member_id, visibility
    into v_trip_id, v_creator, v_old_vis
  from expenses
  where id = p_expense_id;

  if v_trip_id is null then
    raise exception 'expense not found';
  end if;

  perform public.validate_tz_disambig(v_trip_id, p_tz_disambig_transit_id, p_tz_disambig_side);

  -- メンバー判定と「場所を作るときの作成者」を兼ねるので id で取る。
  select id into v_my_member_id
  from trip_members
  where trip_id = v_trip_id and user_id = v_uid and left_at is null;

  if v_my_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  select exists (
    select 1 from trip_members
    where id = v_creator and user_id = v_uid
  ) into v_is_creator;

  if (v_old_vis = 'private' or p_visibility = 'private') and not v_is_creator then
    raise exception 'not allowed to edit this expense' using errcode = '42501';
  end if;

  select exists (
    select 1 from trip_members
    where id = p_payer_member_id
      and trip_id = v_trip_id
      and left_at is null
  ) into v_payer_ok;
  if not v_payer_ok then
    raise exception 'payer is not an active member of this trip';
  end if;

  select key into v_category_key
  from expense_categories
  where id = p_category_id
    and trip_id = v_trip_id;
  if not found then
    raise exception 'category does not belong to this trip';
  end if;

  -- 初めてその場所を登録するときだけ、費用カテゴリから既定アイコンを当てる
  -- （create_expense と同じ考え方。既存の場所には影響しない）。
  v_suggest_icon := public.default_place_icon_for_expense_category(v_category_key);
  if v_suggest_icon is not null then
    if p_place ? 'google' and coalesce(p_place -> 'google' ->> 'icon', '') = '' then
      p_place := jsonb_set(p_place, '{google,icon}', to_jsonb(v_suggest_icon));
    elsif p_place ? 'freetext' and coalesce(p_place -> 'freetext' ->> 'icon', '') = '' then
      p_place := jsonb_set(p_place, '{freetext,icon}', to_jsonb(v_suggest_icon));
    end if;
  end if;

  v_place_id := public.resolve_place_spec(v_trip_id, v_my_member_id, p_place);

  update expenses
  set local_price     = p_local_price,
      local_currency  = p_local_currency,
      rate_to_default = p_rate_to_default,
      category_id     = p_category_id,
      payer_member_id = p_payer_member_id,
      visibility      = p_visibility,
      splittable      = p_splittable,
      note            = nullif(trim(coalesce(p_note, '')), ''),
      paid_at         = coalesce(p_paid_at, paid_at),
      tz_disambig_transit_id = p_tz_disambig_transit_id,
      tz_disambig_side       = p_tz_disambig_side,
      place_id        = v_place_id
  where id = p_expense_id;

  delete from expense_splits where expense_id = p_expense_id;
  if p_splittable and p_split_member_ids is not null then
    foreach v_split_member_id in array p_split_member_ids loop
      if not exists (
        select 1 from trip_members
        where id = v_split_member_id
          and trip_id = v_trip_id
          and left_at is null
      ) then
        raise exception 'split member % is not an active member of this trip',
          v_split_member_id;
      end if;
      insert into expense_splits (expense_id, member_id)
      values (p_expense_id, v_split_member_id)
      on conflict do nothing;
    end loop;
  end if;

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$$;


ALTER FUNCTION "public"."update_expense"("p_expense_id" "uuid", "p_local_price" numeric, "p_local_currency" "text", "p_rate_to_default" numeric, "p_category_id" "uuid", "p_payer_member_id" "uuid", "p_visibility" "text", "p_splittable" boolean, "p_note" "text", "p_paid_at" timestamp without time zone, "p_split_member_ids" "uuid"[], "p_place" "jsonb", "p_tz_disambig_transit_id" "uuid", "p_tz_disambig_side" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_place"("p_place_id" "uuid", "p_tentative" boolean, "p_visibility" "text", "p_note" "text", "p_icon" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."update_place"("p_place_id" "uuid", "p_tentative" boolean, "p_visibility" "text", "p_note" "text", "p_icon" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_tz_disambig"("p_trip_id" "text", "p_tz_disambig_transit_id" "uuid", "p_tz_disambig_side" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_tz_disambig_side is not null and p_tz_disambig_side not in ('depart', 'arrive') then
    raise exception 'invalid tz_disambig_side';
  end if;
  if (p_tz_disambig_transit_id is null) <> (p_tz_disambig_side is null) then
    raise exception 'tz_disambig_transit_id and tz_disambig_side must be set together';
  end if;
  if p_tz_disambig_transit_id is not null and not exists (
    select 1 from events
    where id = p_tz_disambig_transit_id
      and trip_id = p_trip_id
      and kind = 'transit'
  ) then
    raise exception 'tz_disambig_transit_id does not belong to this trip';
  end if;
end;
$$;


ALTER FUNCTION "public"."validate_tz_disambig"("p_trip_id" "text", "p_tz_disambig_transit_id" "uuid", "p_tz_disambig_side" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."event_participants" (
    "event_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL
);


ALTER TABLE "public"."event_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "text" NOT NULL,
    "created_by_member_id" "uuid" NOT NULL,
    "visibility" "text" NOT NULL,
    "title" "text" NOT NULL,
    "start_place_id" "uuid",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kind" "text" DEFAULT 'normal'::"text" NOT NULL,
    "all_day" boolean DEFAULT false NOT NULL,
    "start_at" timestamp without time zone NOT NULL,
    "end_at" timestamp without time zone,
    "start_tz" "text",
    "end_tz" "text",
    "tz_disambig_transit_id" "uuid",
    "tz_disambig_side" "text",
    "end_place_id" "uuid",
    CONSTRAINT "events_allday_normal_chk" CHECK (((NOT "all_day") OR ("kind" = 'normal'::"text"))),
    CONSTRAINT "events_kind_check" CHECK (("kind" = ANY (ARRAY['normal'::"text", 'transit'::"text"]))),
    CONSTRAINT "events_normal_end_after_start_chk" CHECK ((("kind" = 'transit'::"text") OR ("end_at" IS NULL) OR ("end_at" >= "start_at"))),
    CONSTRAINT "events_normal_no_literal_tz_chk" CHECK ((("kind" = 'transit'::"text") OR (("start_tz" IS NULL) AND ("end_tz" IS NULL)))),
    CONSTRAINT "events_transit_endpoints_chk" CHECK ((("kind" <> 'transit'::"text") OR (("start_tz" IS NOT NULL) AND ("end_at" IS NOT NULL) AND ("end_tz" IS NOT NULL) AND ("all_day" = false)))),
    CONSTRAINT "events_transit_no_disambig_chk" CHECK ((("kind" <> 'transit'::"text") OR ("tz_disambig_transit_id" IS NULL))),
    CONSTRAINT "events_tz_disambig_pair_chk" CHECK ((("tz_disambig_transit_id" IS NULL) = ("tz_disambig_side" IS NULL))),
    CONSTRAINT "events_tz_disambig_side_check" CHECK (("tz_disambig_side" = ANY (ARRAY['depart'::"text", 'arrive'::"text"]))),
    CONSTRAINT "events_visibility_check" CHECK (("visibility" = ANY (ARRAY['shared'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."events"."start_place_id" IS '出発地。単一地点の予定ではその場所';



COMMENT ON COLUMN "public"."events"."end_place_id" IS '到着地。NULL は「start_place_id と同じ」の意味（二重に持たない）';



CREATE TABLE IF NOT EXISTS "public"."expense_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" NOT NULL,
    "icon" "text" NOT NULL,
    "sort_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "key" "text"
);


ALTER TABLE "public"."expense_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expense_splits" (
    "expense_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL
);


ALTER TABLE "public"."expense_splits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "text" NOT NULL,
    "created_by_member_id" "uuid" NOT NULL,
    "visibility" "text" NOT NULL,
    "payer_member_id" "uuid" NOT NULL,
    "splittable" boolean DEFAULT true NOT NULL,
    "note" "text",
    "paid_at" timestamp without time zone DEFAULT ("now"() AT TIME ZONE 'utc'::"text") NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "local_price" numeric NOT NULL,
    "local_currency" "text" NOT NULL,
    "rate_to_default" numeric NOT NULL,
    "category_id" "uuid" NOT NULL,
    "place_id" "uuid",
    "tz_disambig_transit_id" "uuid",
    "tz_disambig_side" "text",
    CONSTRAINT "expenses_check" CHECK ((("visibility" = 'shared'::"text") OR ("splittable" = false))),
    CONSTRAINT "expenses_local_currency_check" CHECK (("local_currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "expenses_local_price_check" CHECK (("local_price" > (0)::numeric)),
    CONSTRAINT "expenses_rate_to_default_check" CHECK (("rate_to_default" > (0)::numeric)),
    CONSTRAINT "expenses_tz_disambig_pair_chk" CHECK ((("tz_disambig_transit_id" IS NULL) = ("tz_disambig_side" IS NULL))),
    CONSTRAINT "expenses_tz_disambig_side_check" CHECK (("tz_disambig_side" = ANY (ARRAY['depart'::"text", 'arrive'::"text"]))),
    CONSTRAINT "expenses_visibility_check" CHECK (("visibility" = ANY (ARRAY['shared'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "body" "text" NOT NULL,
    "path" "text",
    "user_agent" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "platform" "text",
    "viewport" "text",
    "timezone" "text",
    "theme" "text",
    "app_version" "text",
    CONSTRAINT "feedback_body_check" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 2000))),
    CONSTRAINT "feedback_kind_check" CHECK (("kind" = ANY (ARRAY['bug'::"text", 'feature'::"text"]))),
    CONSTRAINT "feedback_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'done'::"text"])))
);


ALTER TABLE "public"."feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."flight_api_cache" (
    "cache_key" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."flight_api_cache" OWNER TO "postgres";


COMMENT ON TABLE "public"."flight_api_cache" IS 'フライト照会APIの応答キャッシュ。Edge Function 専用（RLS でポリシー無し＝直接アクセス不可）';



CREATE TABLE IF NOT EXISTS "public"."inbound_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expense_id" "uuid",
    "event_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inbound_drafts_check" CHECK ((("expense_id" IS NULL) OR ("kind" = 'expense'::"text"))),
    CONSTRAINT "inbound_drafts_check1" CHECK ((("event_id" IS NULL) OR ("kind" = 'event'::"text"))),
    CONSTRAINT "inbound_drafts_kind_check" CHECK (("kind" = ANY (ARRAY['expense'::"text", 'event'::"text"]))),
    CONSTRAINT "inbound_drafts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'dismissed'::"text"])))
);


ALTER TABLE "public"."inbound_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inbound_emails" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sender" "text" NOT NULL,
    "recipient" "text" NOT NULL,
    "subject" "text",
    "message_id" "text",
    "raw" "text",
    "size" integer,
    "user_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "extracted" "jsonb",
    "extracted_at" timestamp with time zone,
    "extract_error" "text",
    "trip_id" "text",
    "body_text" "text",
    "merged_into" "uuid",
    "retry_count" integer DEFAULT 0 NOT NULL,
    "next_retry_at" timestamp with time zone,
    CONSTRAINT "inbound_emails_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'extracted'::"text", 'over_quota'::"text", 'error'::"text", 'confirmed'::"text", 'dismissed'::"text", 'merged'::"text"])))
);


ALTER TABLE "public"."inbound_emails" OWNER TO "postgres";


-- 旅行詳細画面がメール取り込みの新着を即座に反映するための Realtime 配信。
-- trip_id を直接持つのはこのテーブルだけ（inbound_drafts は email_id 経由の
-- JOIN が要り、postgres_changes の filter では絞れない）ので、ここへの
-- INSERT/UPDATE（新規到着・旅行への割り当て）をトリガーにクライアント側で
-- 下書き一覧を再取得する。RLS の SELECT ポリシー（inbound_emails_select_own）
-- がそのまま Realtime にも効くので、他ユーザーの行は流れない。
ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."inbound_emails";


CREATE TABLE IF NOT EXISTS "public"."places" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "text" NOT NULL,
    "created_by_member_id" "uuid" NOT NULL,
    "visibility" "text" NOT NULL,
    "google_place_id" "text",
    "name" "text" NOT NULL,
    "lat" double precision,
    "lng" double precision,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "formatted_address" "text",
    "icon" "text" DEFAULT 'pin'::"text" NOT NULL,
    "region" "text",
    "locality" "text",
    "tentative" boolean DEFAULT true NOT NULL,
    "location_dismissed" boolean DEFAULT false NOT NULL,
    CONSTRAINT "places_coords_pair_chk" CHECK ((("lat" IS NULL) = ("lng" IS NULL))),
    CONSTRAINT "places_google_complete_chk" CHECK ((("google_place_id" IS NULL) OR (("lat" IS NOT NULL) AND ("formatted_address" IS NOT NULL)))),
    CONSTRAINT "places_visibility_check" CHECK (("visibility" = ANY (ARRAY['shared'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."places" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receipt_link_candidates" (
    "host" "text" NOT NULL,
    "seen_count" integer DEFAULT 1 NOT NULL,
    "sample_url" "text",
    "first_seen" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen" timestamp with time zone DEFAULT "now"() NOT NULL,
    "skipped_unsubscribe" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."receipt_link_candidates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."todo_likes" (
    "todo_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."todo_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."todos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "text" NOT NULL,
    "created_by_member_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "done" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_id" "uuid",
    "kind" "text" DEFAULT 'prep'::"text" NOT NULL,
    "visibility" "text" DEFAULT 'shared'::"text" NOT NULL,
    CONSTRAINT "todos_kind_check" CHECK (("kind" = ANY (ARRAY['prep'::"text", 'onsite'::"text"]))),
    CONSTRAINT "todos_priority_check" CHECK (("priority" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "todos_visibility_check" CHECK (("visibility" = ANY (ARRAY['shared'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."todos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_invites" (
    "trip_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by_member_id" "uuid",
    "token" "text" NOT NULL
);


ALTER TABLE "public"."trip_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "color" integer,
    "kind" "text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "left_at" timestamp with time zone,
    "is_admin" boolean DEFAULT false NOT NULL,
    CONSTRAINT "trip_members_color_check" CHECK ((("color" IS NULL) OR (("color" >= 0) AND ("color" < 360)))),
    CONSTRAINT "trip_members_kind_check" CHECK (("kind" = ANY (ARRAY['member'::"text", 'guest'::"text"])))
);


ALTER TABLE "public"."trip_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_pin_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "text" NOT NULL,
    "icon" "text" NOT NULL,
    "label" "text" NOT NULL,
    "sort_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."trip_pin_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trips" (
    "id" "text" DEFAULT "public"."nanoid"(10) NOT NULL,
    "title" "text" NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "default_currency" "text" DEFAULT 'JPY'::"text" NOT NULL,
    "last_activity_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "default_timezone" "text",
    CONSTRAINT "trips_default_currency_check" CHECK (("default_currency" ~ '^[A-Z]{3}$'::"text"))
);


ALTER TABLE "public"."trips" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "google_uid" "text",
    "display_name" "text",
    "is_anonymous" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "import_token" "text",
    "avatar_url" "text",
    "is_admin" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."event_participants"
    ADD CONSTRAINT "event_participants_pkey" PRIMARY KEY ("event_id", "member_id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_categories"
    ADD CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_categories"
    ADD CONSTRAINT "expense_categories_trip_id_name_key" UNIQUE ("trip_id", "name");



ALTER TABLE ONLY "public"."expense_splits"
    ADD CONSTRAINT "expense_splits_pkey" PRIMARY KEY ("expense_id", "member_id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."flight_api_cache"
    ADD CONSTRAINT "flight_api_cache_pkey" PRIMARY KEY ("cache_key");



ALTER TABLE ONLY "public"."inbound_drafts"
    ADD CONSTRAINT "inbound_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inbound_emails"
    ADD CONSTRAINT "inbound_emails_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."places"
    ADD CONSTRAINT "places_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receipt_link_candidates"
    ADD CONSTRAINT "receipt_link_candidates_pkey" PRIMARY KEY ("host");



ALTER TABLE ONLY "public"."todo_likes"
    ADD CONSTRAINT "todo_likes_pkey" PRIMARY KEY ("todo_id", "member_id");



ALTER TABLE ONLY "public"."todos"
    ADD CONSTRAINT "todos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_invites"
    ADD CONSTRAINT "trip_invites_pkey" PRIMARY KEY ("trip_id");



ALTER TABLE ONLY "public"."trip_invites"
    ADD CONSTRAINT "trip_invites_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_trip_id_user_id_key" UNIQUE ("trip_id", "user_id");



ALTER TABLE ONLY "public"."trip_pin_options"
    ADD CONSTRAINT "trip_pin_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_pin_options"
    ADD CONSTRAINT "trip_pin_options_trip_id_icon_key" UNIQUE ("trip_id", "icon");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_google_uid_key" UNIQUE ("google_uid");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_import_token_key" UNIQUE ("import_token");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "event_participants_member_idx" ON "public"."event_participants" USING "btree" ("member_id");



CREATE INDEX "events_trip_start_idx" ON "public"."events" USING "btree" ("trip_id", "visibility", "start_at");



CREATE INDEX "expense_categories_trip_sort_idx" ON "public"."expense_categories" USING "btree" ("trip_id", "sort_order");



CREATE INDEX "expense_splits_member_idx" ON "public"."expense_splits" USING "btree" ("member_id");



CREATE INDEX "expenses_category_idx" ON "public"."expenses" USING "btree" ("category_id");



CREATE INDEX "expenses_place_idx" ON "public"."expenses" USING "btree" ("place_id");



CREATE INDEX "expenses_trip_visibility_idx" ON "public"."expenses" USING "btree" ("trip_id", "visibility");



CREATE INDEX "flight_api_cache_fetched_at_idx" ON "public"."flight_api_cache" USING "btree" ("fetched_at");



CREATE INDEX "inbound_drafts_email_idx" ON "public"."inbound_drafts" USING "btree" ("email_id");



CREATE INDEX "inbound_emails_received_idx" ON "public"."inbound_emails" USING "btree" ("received_at" DESC);



CREATE INDEX "inbound_emails_retry_idx" ON "public"."inbound_emails" USING "btree" ("next_retry_at") WHERE (("status" = 'error'::"text") AND ("next_retry_at" IS NOT NULL));



CREATE INDEX "inbound_emails_trip_idx" ON "public"."inbound_emails" USING "btree" ("trip_id");



CREATE INDEX "inbound_emails_user_idx" ON "public"."inbound_emails" USING "btree" ("user_id");



CREATE INDEX "inbound_emails_user_received_idx" ON "public"."inbound_emails" USING "btree" ("user_id", "received_at");



CREATE INDEX "places_trip_idx" ON "public"."places" USING "btree" ("trip_id");



CREATE INDEX "places_trip_visibility_idx" ON "public"."places" USING "btree" ("trip_id", "visibility");



CREATE INDEX "todo_likes_todo_idx" ON "public"."todo_likes" USING "btree" ("todo_id");



CREATE UNIQUE INDEX "todos_event_uniq" ON "public"."todos" USING "btree" ("event_id") WHERE ("event_id" IS NOT NULL);



CREATE INDEX "todos_trip_idx" ON "public"."todos" USING "btree" ("trip_id");



CREATE INDEX "trip_members_trip_idx" ON "public"."trip_members" USING "btree" ("trip_id");



CREATE INDEX "trip_members_user_active_idx" ON "public"."trip_members" USING "btree" ("user_id", "left_at");



CREATE INDEX "trip_pin_options_trip_sort_idx" ON "public"."trip_pin_options" USING "btree" ("trip_id", "sort_order");



CREATE OR REPLACE TRIGGER "trg_clear_dependent_tz_disambig" BEFORE DELETE ON "public"."events" FOR EACH ROW WHEN (("old"."kind" = 'transit'::"text")) EXECUTE FUNCTION "public"."clear_dependent_tz_disambig"();



CREATE OR REPLACE TRIGGER "trg_confirm_place_on_event_link" AFTER INSERT OR UPDATE OF "start_place_id", "end_place_id" ON "public"."events" FOR EACH ROW WHEN ((("new"."start_place_id" IS NOT NULL) OR ("new"."end_place_id" IS NOT NULL))) EXECUTE FUNCTION "public"."confirm_place_on_link"();



CREATE OR REPLACE TRIGGER "trg_confirm_place_on_expense_link" AFTER INSERT OR UPDATE OF "place_id" ON "public"."expenses" FOR EACH ROW WHEN (("new"."place_id" IS NOT NULL)) EXECUTE FUNCTION "public"."confirm_place_on_expense_link"();



ALTER TABLE ONLY "public"."event_participants"
    ADD CONSTRAINT "event_participants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_participants"
    ADD CONSTRAINT "event_participants_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."trip_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."trip_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_end_place_id_fkey" FOREIGN KEY ("end_place_id") REFERENCES "public"."places"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_place_id_fkey" FOREIGN KEY ("start_place_id") REFERENCES "public"."places"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_tz_disambig_transit_id_fkey" FOREIGN KEY ("tz_disambig_transit_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expense_categories"
    ADD CONSTRAINT "expense_categories_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expense_splits"
    ADD CONSTRAINT "expense_splits_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expense_splits"
    ADD CONSTRAINT "expense_splits_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."trip_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."trip_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_payer_member_id_fkey" FOREIGN KEY ("payer_member_id") REFERENCES "public"."trip_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_tz_disambig_transit_id_fkey" FOREIGN KEY ("tz_disambig_transit_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inbound_drafts"
    ADD CONSTRAINT "inbound_drafts_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "public"."inbound_emails"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inbound_drafts"
    ADD CONSTRAINT "inbound_drafts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inbound_drafts"
    ADD CONSTRAINT "inbound_drafts_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inbound_emails"
    ADD CONSTRAINT "inbound_emails_merged_into_fkey" FOREIGN KEY ("merged_into") REFERENCES "public"."inbound_emails"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inbound_emails"
    ADD CONSTRAINT "inbound_emails_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inbound_emails"
    ADD CONSTRAINT "inbound_emails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."places"
    ADD CONSTRAINT "places_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."trip_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."places"
    ADD CONSTRAINT "places_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."todo_likes"
    ADD CONSTRAINT "todo_likes_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."trip_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."todo_likes"
    ADD CONSTRAINT "todo_likes_todo_id_fkey" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."todos"
    ADD CONSTRAINT "todos_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."trip_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."todos"
    ADD CONSTRAINT "todos_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."todos"
    ADD CONSTRAINT "todos_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_invites"
    ADD CONSTRAINT "trip_invites_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."trip_members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_invites"
    ADD CONSTRAINT "trip_invites_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_pin_options"
    ADD CONSTRAINT "trip_pin_options_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."event_participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_participants_visible" ON "public"."event_participants" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_participants"."event_id") AND ((("e"."visibility" = 'shared'::"text") AND "public"."is_active_trip_member"("e"."trip_id")) OR (("e"."visibility" = 'private'::"text") AND (EXISTS ( SELECT 1
           FROM "public"."trip_members" "tm"
          WHERE (("tm"."id" = "e"."created_by_member_id") AND ("tm"."user_id" = "auth"."uid"()))))))))));



ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "events_delete" ON "public"."events" FOR DELETE USING (((("visibility" = 'shared'::"text") AND "public"."is_active_trip_member"("trip_id")) OR (("visibility" = 'private'::"text") AND "public"."is_own_member"("created_by_member_id"))));



CREATE POLICY "events_insert" ON "public"."events" FOR INSERT WITH CHECK (("public"."is_active_trip_member"("trip_id") AND "public"."is_own_member"("created_by_member_id")));



CREATE POLICY "events_select" ON "public"."events" FOR SELECT USING (((("visibility" = 'shared'::"text") AND "public"."is_active_trip_member"("trip_id")) OR (("visibility" = 'private'::"text") AND "public"."is_own_member"("created_by_member_id"))));



CREATE POLICY "events_update" ON "public"."events" FOR UPDATE USING (((("visibility" = 'shared'::"text") AND "public"."is_active_trip_member"("trip_id")) OR (("visibility" = 'private'::"text") AND "public"."is_own_member"("created_by_member_id")))) WITH CHECK (((("visibility" = 'shared'::"text") AND "public"."is_active_trip_member"("trip_id")) OR (("visibility" = 'private'::"text") AND "public"."is_own_member"("created_by_member_id"))));



ALTER TABLE "public"."expense_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_categories_delete" ON "public"."expense_categories" FOR DELETE USING ("public"."is_active_trip_member"("trip_id"));



CREATE POLICY "expense_categories_insert" ON "public"."expense_categories" FOR INSERT WITH CHECK ("public"."is_active_trip_member"("trip_id"));



CREATE POLICY "expense_categories_select" ON "public"."expense_categories" FOR SELECT USING ("public"."is_active_trip_member"("trip_id"));



CREATE POLICY "expense_categories_update" ON "public"."expense_categories" FOR UPDATE USING ("public"."is_active_trip_member"("trip_id")) WITH CHECK ("public"."is_active_trip_member"("trip_id"));



ALTER TABLE "public"."expense_splits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_splits_all" ON "public"."expense_splits" USING (("expense_id" IN ( SELECT "expenses"."id"
   FROM "public"."expenses"
  WHERE ((("expenses"."visibility" = 'shared'::"text") AND "public"."is_active_trip_member"("expenses"."trip_id")) OR (("expenses"."visibility" = 'private'::"text") AND "public"."is_own_member"("expenses"."created_by_member_id")))))) WITH CHECK (("expense_id" IN ( SELECT "expenses"."id"
   FROM "public"."expenses"
  WHERE ((("expenses"."visibility" = 'shared'::"text") AND "public"."is_active_trip_member"("expenses"."trip_id")) OR (("expenses"."visibility" = 'private'::"text") AND "public"."is_own_member"("expenses"."created_by_member_id"))))));



ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expenses_delete" ON "public"."expenses" FOR DELETE USING (((("visibility" = 'shared'::"text") AND "public"."is_active_trip_member"("trip_id")) OR (("visibility" = 'private'::"text") AND "public"."is_own_member"("created_by_member_id"))));



CREATE POLICY "expenses_insert" ON "public"."expenses" FOR INSERT WITH CHECK (("public"."is_active_trip_member"("trip_id") AND "public"."is_own_member"("created_by_member_id")));



CREATE POLICY "expenses_select" ON "public"."expenses" FOR SELECT USING (((("visibility" = 'shared'::"text") AND "public"."is_active_trip_member"("trip_id")) OR (("visibility" = 'private'::"text") AND "public"."is_own_member"("created_by_member_id"))));



CREATE POLICY "expenses_update" ON "public"."expenses" FOR UPDATE USING (((("visibility" = 'shared'::"text") AND "public"."is_active_trip_member"("trip_id")) OR (("visibility" = 'private'::"text") AND "public"."is_own_member"("created_by_member_id")))) WITH CHECK (((("visibility" = 'shared'::"text") AND "public"."is_active_trip_member"("trip_id")) OR (("visibility" = 'private'::"text") AND "public"."is_own_member"("created_by_member_id"))));



ALTER TABLE "public"."feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "feedback_admin_select" ON "public"."feedback" FOR SELECT USING ("public"."is_app_admin"());



CREATE POLICY "feedback_admin_update" ON "public"."feedback" FOR UPDATE USING ("public"."is_app_admin"()) WITH CHECK ("public"."is_app_admin"());



CREATE POLICY "feedback_insert_own" ON "public"."feedback" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "feedback_select_own" ON "public"."feedback" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."flight_api_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inbound_drafts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inbound_drafts_select_own" ON "public"."inbound_drafts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."inbound_emails" "e"
  WHERE (("e"."id" = "inbound_drafts"."email_id") AND ("e"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."inbound_emails" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inbound_emails_select_own" ON "public"."inbound_emails" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."places" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "places_delete" ON "public"."places" FOR DELETE USING (((("visibility" = 'shared'::"text") AND "public"."is_active_trip_member"("trip_id")) OR (("visibility" = 'private'::"text") AND "public"."is_own_member"("created_by_member_id"))));



CREATE POLICY "places_insert" ON "public"."places" FOR INSERT WITH CHECK (("public"."is_active_trip_member"("trip_id") AND "public"."is_own_member"("created_by_member_id")));



CREATE POLICY "places_select" ON "public"."places" FOR SELECT USING (((("visibility" = 'shared'::"text") AND "public"."is_active_trip_member"("trip_id")) OR (("visibility" = 'private'::"text") AND "public"."is_own_member"("created_by_member_id"))));



CREATE POLICY "places_update" ON "public"."places" FOR UPDATE USING (((("visibility" = 'shared'::"text") AND "public"."is_active_trip_member"("trip_id")) OR (("visibility" = 'private'::"text") AND "public"."is_own_member"("created_by_member_id")))) WITH CHECK (((("visibility" = 'shared'::"text") AND "public"."is_active_trip_member"("trip_id")) OR (("visibility" = 'private'::"text") AND "public"."is_own_member"("created_by_member_id"))));



ALTER TABLE "public"."receipt_link_candidates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "receipt_link_candidates_admin_select" ON "public"."receipt_link_candidates" FOR SELECT USING ("public"."is_app_admin"());



ALTER TABLE "public"."todo_likes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "todo_likes_delete" ON "public"."todo_likes" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."trip_members" "m"
  WHERE (("m"."id" = "todo_likes"."member_id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "todo_likes_insert" ON "public"."todo_likes" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."todos" "t"
  WHERE (("t"."id" = "todo_likes"."todo_id") AND "public"."is_active_trip_member"("t"."trip_id")))) AND (EXISTS ( SELECT 1
   FROM "public"."trip_members" "m"
  WHERE (("m"."id" = "todo_likes"."member_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."left_at" IS NULL))))));



CREATE POLICY "todo_likes_select" ON "public"."todo_likes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."todos" "t"
  WHERE (("t"."id" = "todo_likes"."todo_id") AND "public"."is_active_trip_member"("t"."trip_id")))));



ALTER TABLE "public"."todos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "todos_visibility" ON "public"."todos" USING (((("visibility" = 'shared'::"text") AND "public"."is_active_trip_member"("trip_id")) OR (("visibility" = 'private'::"text") AND "public"."is_own_member"("created_by_member_id")))) WITH CHECK (((("visibility" = 'shared'::"text") AND "public"."is_active_trip_member"("trip_id")) OR (("visibility" = 'private'::"text") AND "public"."is_own_member"("created_by_member_id"))));



ALTER TABLE "public"."trip_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trip_invites_member_all" ON "public"."trip_invites" USING ("public"."is_active_trip_member"("trip_id")) WITH CHECK ("public"."is_active_trip_member"("trip_id"));



ALTER TABLE "public"."trip_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trip_members_self_delete" ON "public"."trip_members" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "trip_members_self_insert" ON "public"."trip_members" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "trip_members_self_update" ON "public"."trip_members" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "trip_members_visible" ON "public"."trip_members" FOR SELECT USING ("public"."is_active_trip_member"("trip_id"));



ALTER TABLE "public"."trip_pin_options" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trip_pin_options_delete" ON "public"."trip_pin_options" FOR DELETE USING ("public"."is_active_trip_member"("trip_id"));



CREATE POLICY "trip_pin_options_insert" ON "public"."trip_pin_options" FOR INSERT WITH CHECK ("public"."is_active_trip_member"("trip_id"));



CREATE POLICY "trip_pin_options_select" ON "public"."trip_pin_options" FOR SELECT USING ("public"."is_active_trip_member"("trip_id"));



CREATE POLICY "trip_pin_options_update" ON "public"."trip_pin_options" FOR UPDATE USING ("public"."is_active_trip_member"("trip_id")) WITH CHECK ("public"."is_active_trip_member"("trip_id"));



ALTER TABLE "public"."trips" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trips_admin_update" ON "public"."trips" FOR UPDATE USING ("public"."is_trip_admin"("id")) WITH CHECK ("public"."is_trip_admin"("id"));



CREATE POLICY "trips_authenticated_insert" ON "public"."trips" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "trips_member_delete" ON "public"."trips" FOR DELETE USING ("public"."is_trip_admin"("id"));



CREATE POLICY "trips_member_select" ON "public"."trips" FOR SELECT USING ("public"."is_active_trip_member"("id"));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_admin_select" ON "public"."users" FOR SELECT USING ("public"."is_app_admin"());



CREATE POLICY "users_self_insert" ON "public"."users" FOR INSERT WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "users_self_select" ON "public"."users" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "users_self_update" ON "public"."users" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";




























































































































































REVOKE ALL ON FUNCTION "public"."assign_inbound_email_trip"("p_id" "uuid", "p_trip_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_inbound_email_trip"("p_id" "uuid", "p_trip_id" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."copy_trip"("p_source_trip_id" "text", "p_title" "text", "p_start_date" "date", "p_end_date" "date", "p_default_currency" "text", "p_display_name" "text", "p_events" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."copy_trip"("p_source_trip_id" "text", "p_title" "text", "p_start_date" "date", "p_end_date" "date", "p_default_currency" "text", "p_display_name" "text", "p_events" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_expense"("p_trip_id" "text", "p_local_price" numeric, "p_local_currency" "text", "p_rate_to_default" numeric, "p_category_id" "uuid", "p_payer_member_id" "uuid", "p_visibility" "text", "p_splittable" boolean, "p_note" "text", "p_paid_at" timestamp without time zone, "p_split_member_ids" "uuid"[], "p_place" "jsonb", "p_tz_disambig_transit_id" "uuid", "p_tz_disambig_side" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_expense"("p_trip_id" "text", "p_local_price" numeric, "p_local_currency" "text", "p_rate_to_default" numeric, "p_category_id" "uuid", "p_payer_member_id" "uuid", "p_visibility" "text", "p_splittable" boolean, "p_note" "text", "p_paid_at" timestamp without time zone, "p_split_member_ids" "uuid"[], "p_place" "jsonb", "p_tz_disambig_transit_id" "uuid", "p_tz_disambig_side" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_place"("p_trip_id" "text", "p_name" "text", "p_tentative" boolean, "p_visibility" "text", "p_note" "text", "p_google_place_id" "text", "p_lat" double precision, "p_lng" double precision, "p_formatted_address" "text", "p_icon" "text", "p_region" "text", "p_locality" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_place"("p_trip_id" "text", "p_name" "text", "p_tentative" boolean, "p_visibility" "text", "p_note" "text", "p_google_place_id" "text", "p_lat" double precision, "p_lng" double precision, "p_formatted_address" "text", "p_icon" "text", "p_region" "text", "p_locality" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_todo"("p_trip_id" "text", "p_title" "text", "p_priority" "text", "p_kind" "text", "p_visibility" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_todo"("p_trip_id" "text", "p_title" "text", "p_priority" "text", "p_kind" "text", "p_visibility" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_trip"("p_title" "text", "p_start_date" "date", "p_end_date" "date", "p_default_currency" "text", "p_display_name" "text", "p_client_tz" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_trip"("p_title" "text", "p_start_date" "date", "p_end_date" "date", "p_default_currency" "text", "p_display_name" "text", "p_client_tz" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."dismiss_inbound_email"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dismiss_inbound_email"("p_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ensure_import_token"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_import_token"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ensure_trip_invite"("p_trip_id" "text", "p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_trip_invite"("p_trip_id" "text", "p_token" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."finalize_inbound_email_if_resolved"("p_email_id" "uuid", "p_uid" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."find_or_create_trip_freetext_place"("p_trip_id" "text", "p_member_id" "uuid", "p_name" "text", "p_lat" double precision, "p_lng" double precision, "p_icon" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."is_trip_admin"("_trip_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_trip_admin"("_trip_id" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."join_trip_via_invite"("p_token" "text", "p_display_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_trip_via_invite"("p_token" "text", "p_display_name" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."peek_invite"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."peek_invite"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."peek_invite"("p_token" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."pick_member_color"("p_trip_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pick_member_color"("p_trip_id" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rebuild_inbound_drafts"("p_email_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."record_receipt_link_candidate"("p_host" "text", "p_sample_url" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."record_receipt_link_candidate"("p_host" "text", "p_sample_url" "text", "p_skipped_unsubscribe" boolean) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."regenerate_trip_invite"("p_trip_id" "text", "p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."regenerate_trip_invite"("p_trip_id" "text", "p_token" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."remove_trip_member"("p_member_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_trip_member"("p_member_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."resolve_inbound_draft"("p_id" "uuid", "p_status" "text", "p_expense_id" "uuid", "p_event_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_inbound_draft"("p_id" "uuid", "p_status" "text", "p_expense_id" "uuid", "p_event_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_event_reservation"("p_event_id" "uuid", "p_needs" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_event_reservation"("p_event_id" "uuid", "p_needs" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_place_location"("p_place_id" "uuid", "p_lat" double precision, "p_lng" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_place_location"("p_place_id" "uuid", "p_lat" double precision, "p_lng" double precision) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."resolve_place_to_google"("p_place_id" "uuid", "p_google_place_id" "text", "p_name" "text", "p_lat" double precision, "p_lng" double precision, "p_formatted_address" "text", "p_icon" "text", "p_region" "text", "p_locality" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_place_to_google"("p_place_id" "uuid", "p_google_place_id" "text", "p_name" "text", "p_lat" double precision, "p_lng" double precision, "p_formatted_address" "text", "p_icon" "text", "p_region" "text", "p_locality" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."dismiss_place_location"("p_place_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dismiss_place_location"("p_place_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."unmerge_inbound_email"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unmerge_inbound_email"("p_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_expense"("p_expense_id" "uuid", "p_local_price" numeric, "p_local_currency" "text", "p_rate_to_default" numeric, "p_category_id" "uuid", "p_payer_member_id" "uuid", "p_visibility" "text", "p_splittable" boolean, "p_note" "text", "p_paid_at" timestamp without time zone, "p_split_member_ids" "uuid"[], "p_place" "jsonb", "p_tz_disambig_transit_id" "uuid", "p_tz_disambig_side" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_expense"("p_expense_id" "uuid", "p_local_price" numeric, "p_local_currency" "text", "p_rate_to_default" numeric, "p_category_id" "uuid", "p_payer_member_id" "uuid", "p_visibility" "text", "p_splittable" boolean, "p_note" "text", "p_paid_at" timestamp without time zone, "p_split_member_ids" "uuid"[], "p_place" "jsonb", "p_tz_disambig_transit_id" "uuid", "p_tz_disambig_side" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_place"("p_place_id" "uuid", "p_tentative" boolean, "p_visibility" "text", "p_note" "text", "p_icon" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_place"("p_place_id" "uuid", "p_tentative" boolean, "p_visibility" "text", "p_note" "text", "p_icon" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."validate_tz_disambig"("p_trip_id" "text", "p_tz_disambig_transit_id" "uuid", "p_tz_disambig_side" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_tz_disambig"("p_trip_id" "text", "p_tz_disambig_transit_id" "uuid", "p_tz_disambig_side" "text") TO "authenticated";


















GRANT ALL ON TABLE "public"."event_participants" TO "anon";
GRANT ALL ON TABLE "public"."event_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."event_participants" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."expense_categories" TO "anon";
GRANT ALL ON TABLE "public"."expense_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_categories" TO "service_role";



GRANT ALL ON TABLE "public"."expense_splits" TO "anon";
GRANT ALL ON TABLE "public"."expense_splits" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_splits" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."feedback" TO "anon";
GRANT ALL ON TABLE "public"."feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback" TO "service_role";



GRANT INSERT("user_id") ON TABLE "public"."feedback" TO "authenticated";



GRANT INSERT("kind") ON TABLE "public"."feedback" TO "authenticated";



GRANT INSERT("body") ON TABLE "public"."feedback" TO "authenticated";



GRANT INSERT("path") ON TABLE "public"."feedback" TO "authenticated";



GRANT INSERT("user_agent") ON TABLE "public"."feedback" TO "authenticated";



GRANT UPDATE("status") ON TABLE "public"."feedback" TO "authenticated";



GRANT INSERT("platform") ON TABLE "public"."feedback" TO "authenticated";



GRANT INSERT("viewport") ON TABLE "public"."feedback" TO "authenticated";



GRANT INSERT("timezone") ON TABLE "public"."feedback" TO "authenticated";



GRANT INSERT("theme") ON TABLE "public"."feedback" TO "authenticated";



GRANT INSERT("app_version") ON TABLE "public"."feedback" TO "authenticated";



GRANT ALL ON TABLE "public"."flight_api_cache" TO "anon";
GRANT ALL ON TABLE "public"."flight_api_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."flight_api_cache" TO "service_role";



GRANT ALL ON TABLE "public"."inbound_drafts" TO "anon";
GRANT ALL ON TABLE "public"."inbound_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."inbound_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."inbound_emails" TO "anon";
GRANT ALL ON TABLE "public"."inbound_emails" TO "authenticated";
GRANT ALL ON TABLE "public"."inbound_emails" TO "service_role";



GRANT ALL ON TABLE "public"."places" TO "anon";
GRANT ALL ON TABLE "public"."places" TO "authenticated";
GRANT ALL ON TABLE "public"."places" TO "service_role";



GRANT ALL ON TABLE "public"."receipt_link_candidates" TO "anon";
GRANT ALL ON TABLE "public"."receipt_link_candidates" TO "authenticated";
GRANT ALL ON TABLE "public"."receipt_link_candidates" TO "service_role";



GRANT ALL ON TABLE "public"."todo_likes" TO "anon";
GRANT ALL ON TABLE "public"."todo_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."todo_likes" TO "service_role";



GRANT ALL ON TABLE "public"."todos" TO "anon";
GRANT ALL ON TABLE "public"."todos" TO "authenticated";
GRANT ALL ON TABLE "public"."todos" TO "service_role";



GRANT ALL ON TABLE "public"."trip_invites" TO "anon";
GRANT ALL ON TABLE "public"."trip_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_invites" TO "service_role";



GRANT ALL ON TABLE "public"."trip_members" TO "anon";
GRANT ALL ON TABLE "public"."trip_members" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_members" TO "service_role";



GRANT ALL ON TABLE "public"."trip_pin_options" TO "anon";
GRANT ALL ON TABLE "public"."trip_pin_options" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_pin_options" TO "service_role";



GRANT ALL ON TABLE "public"."trips" TO "anon";
GRANT ALL ON TABLE "public"."trips" TO "authenticated";
GRANT ALL ON TABLE "public"."trips" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT UPDATE("display_name") ON TABLE "public"."users" TO "authenticated";



GRANT UPDATE("avatar_url") ON TABLE "public"."users" TO "authenticated";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































--
-- Dumped schema changes for auth and storage
--

CREATE OR REPLACE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();



-- アバター画像の保管バケット（公開：読み取りは誰でも可。書き込みは本人フォルダのみ）。
INSERT INTO "storage"."buckets" ("id", "name", "public")
VALUES ('avatars', 'avatars', true)
ON CONFLICT ("id") DO NOTHING;



CREATE POLICY "avatars_delete_own" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



CREATE POLICY "avatars_insert_own" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



CREATE POLICY "avatars_read_all" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'avatars'::"text"));



CREATE POLICY "avatars_update_own" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



