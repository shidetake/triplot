-- default_timezone のシード元を「最初の予定/費用を作った瞬間」から
-- 「旅行を作った瞬間」に変更する。
--
-- 理由: 「最初の予定/費用作成時」だと、いつ・誰の（共有旅行なら複数メンバーが
-- 触れうる）ブラウザTZで決まるかが曖昧になる。旅行の作成は必ず単独の作成者の
-- 操作で、かつ1回しか起きないので、「旅行の既定TZ」という概念そのものと
-- タイミングが一致する。create_event/create_expense 側からは
-- seed_trip_default_timezone 呼び出しと p_client_tz パラメータを撤去し、
-- create_trip だけが default_timezone を決める唯一の場所にする。

drop function if exists public.seed_trip_default_timezone(text, text);

-- ════════════════════════════════════════════════════════════
-- create_trip: p_client_tz を追加し、default_timezone を作成時に確定する
-- ════════════════════════════════════════════════════════════

drop function if exists public.create_trip(text, date, date, text, text);

create or replace function public.create_trip(
  p_title             text,
  p_start_date        date,
  p_end_date          date,
  p_default_currency  text,
  p_display_name      text,
  p_client_tz         text
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

  return v_trip_id;
end;
$body$;

revoke all on function public.create_trip(text, date, date, text, text, text) from public;
grant execute on function public.create_trip(text, date, date, text, text, text) to authenticated;

-- ════════════════════════════════════════════════════════════
-- create_event / create_expense (+ ラッパー): p_client_tz を撤去
-- ════════════════════════════════════════════════════════════

drop function if exists public.create_event(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, uuid, text, text, uuid[], text
);

create or replace function public.create_event(
  p_trip_id                 text,
  p_title                   text,
  p_kind                    text,
  p_all_day                 boolean,
  p_start_at                timestamp,
  p_end_at                  timestamp,
  p_start_tz                text,
  p_end_tz                  text,
  p_tz_disambig_transit_id  uuid,
  p_tz_disambig_side        text,
  p_place_id                uuid,
  p_visibility              text,
  p_note                    text,
  p_participant_member_ids  uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid                  uuid := auth.uid();
  v_my_member_id         uuid;
  v_event_id             uuid;
  v_end_at                timestamp := p_end_at;
  v_end_tz                text;
  v_store_start_tz         text;
  v_disambig_transit_id    uuid;
  v_disambig_side          text;
  v_place_ok              boolean;
  v_bad_count             int;
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

  if p_place_id is not null then
    select exists (
      select 1 from places
      where id = p_place_id and trip_id = p_trip_id
    ) into v_place_ok;
    if not v_place_ok then
      raise exception 'place does not belong to this trip';
    end if;
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
    tz_disambig_transit_id, tz_disambig_side, place_id, note
  )
  values (
    p_trip_id, v_my_member_id, p_visibility, p_kind, coalesce(p_all_day, false),
    trim(p_title), p_start_at, v_end_at, v_store_start_tz, v_end_tz,
    v_disambig_transit_id, v_disambig_side, p_place_id,
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
$body$;

revoke all on function public.create_event(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, uuid, text, text, uuid[]
) from public;
grant execute on function public.create_event(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, uuid, text, text, uuid[]
) to authenticated;

drop function if exists public.create_event_with_place(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text,
  text, text, double precision, double precision, text, text, text, text, uuid[], text
);

create or replace function public.create_event_with_place(
  p_trip_id                 text,
  p_title                   text,
  p_kind                    text,
  p_all_day                 boolean,
  p_start_at                timestamp,
  p_end_at                  timestamp,
  p_start_tz                text,
  p_end_tz                  text,
  p_tz_disambig_transit_id  uuid,
  p_tz_disambig_side        text,
  p_visibility              text,
  p_note                    text,
  p_google_place_id         text,
  p_place_name              text,
  p_lat                     double precision,
  p_lng                     double precision,
  p_formatted_address       text,
  p_icon                    text,
  p_region                  text,
  p_locality                text,
  p_participant_member_ids  uuid[]
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
    p_start_tz, p_end_tz, p_tz_disambig_transit_id, p_tz_disambig_side,
    v_place_id, p_visibility, p_note, p_participant_member_ids
  );
end;
$body$;

revoke all on function public.create_event_with_place(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text,
  text, text, double precision, double precision, text, text, text, text, uuid[]
) from public;
grant execute on function public.create_event_with_place(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text,
  text, text, double precision, double precision, text, text, text, text, uuid[]
) to authenticated;

drop function if exists public.create_event_with_freetext_place(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text, text, uuid[], text
);

create or replace function public.create_event_with_freetext_place(
  p_trip_id                 text,
  p_title                   text,
  p_kind                    text,
  p_all_day                 boolean,
  p_start_at                timestamp,
  p_end_at                  timestamp,
  p_start_tz                text,
  p_end_tz                  text,
  p_tz_disambig_transit_id  uuid,
  p_tz_disambig_side        text,
  p_visibility              text,
  p_note                    text,
  p_place_name              text,
  p_participant_member_ids  uuid[]
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

  v_place_id := public.find_or_create_trip_freetext_place(
    p_trip_id, v_member_id, p_place_name
  );

  return public.create_event(
    p_trip_id, p_title, p_kind, p_all_day, p_start_at, p_end_at,
    p_start_tz, p_end_tz, p_tz_disambig_transit_id, p_tz_disambig_side,
    v_place_id, p_visibility, p_note, p_participant_member_ids
  );
end;
$body$;

revoke all on function public.create_event_with_freetext_place(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text, text, uuid[]
) from public;
grant execute on function public.create_event_with_freetext_place(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text, text, uuid[]
) to authenticated;

-- ────────────────────────────────────────────────────────────
-- create_expense (+ ラッパー): p_client_tz を撤去。p_tz(occurred_at計算用)は残す。
-- ────────────────────────────────────────────────────────────

drop function if exists public.create_expense(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], uuid, text, uuid, text, text
);

create or replace function public.create_expense(
  p_trip_id                 text,
  p_local_price             numeric,
  p_local_currency          text,
  p_rate_to_default         numeric,
  p_category_id             uuid,
  p_payer_member_id         uuid,
  p_visibility              text,
  p_splittable              boolean,
  p_note                    text,
  p_paid_at                 timestamp,
  p_split_member_ids        uuid[],
  p_place_id                uuid,
  p_tz                      text,
  p_tz_disambig_transit_id  uuid,
  p_tz_disambig_side        text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid              uuid := auth.uid();
  v_my_member_id     uuid;
  v_expense_id       uuid;
  v_split_member_id  uuid;
  v_payer_ok         boolean;
  v_category_ok      boolean;
  v_place_ok         boolean;
  v_resolved_tz       text := nullif(trim(coalesce(p_tz, '')), '');
  v_paid_at          timestamp := coalesce(p_paid_at, (now() at time zone 'utc'));
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if v_resolved_tz is null then
    raise exception 'tz required';
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

  select exists (
    select 1 from expense_categories
    where id = p_category_id
      and trip_id = p_trip_id
  ) into v_category_ok;

  if not v_category_ok then
    raise exception 'category does not belong to this trip';
  end if;

  if p_place_id is not null then
    select exists (
      select 1 from places
      where id = p_place_id and trip_id = p_trip_id
    ) into v_place_ok;
    if not v_place_ok then
      raise exception 'place does not belong to this trip';
    end if;
  end if;

  insert into expenses (
    trip_id, created_by_member_id, visibility, local_price, local_currency,
    rate_to_default, category_id, payer_member_id, splittable, note, paid_at,
    place_id, occurred_at, tz_disambig_transit_id, tz_disambig_side
  )
  values (
    p_trip_id, v_my_member_id, p_visibility, p_local_price, p_local_currency,
    p_rate_to_default, p_category_id, p_payer_member_id, p_splittable,
    nullif(trim(coalesce(p_note, '')), ''), v_paid_at,
    p_place_id, (v_paid_at at time zone v_resolved_tz),
    p_tz_disambig_transit_id, p_tz_disambig_side
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
$body$;

revoke all on function public.create_expense(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], uuid, text, uuid, text
) from public;
grant execute on function public.create_expense(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], uuid, text, uuid, text
) to authenticated;

drop function if exists public.create_expense_with_place(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, double precision, double precision, text, text, text, text, text, uuid, text, text
);

create or replace function public.create_expense_with_place(
  p_trip_id                 text,
  p_local_price             numeric,
  p_local_currency          text,
  p_rate_to_default         numeric,
  p_category_id             uuid,
  p_payer_member_id         uuid,
  p_visibility              text,
  p_splittable              boolean,
  p_note                    text,
  p_paid_at                 timestamp,
  p_split_member_ids        uuid[],
  p_google_place_id         text,
  p_place_name              text,
  p_lat                     double precision,
  p_lng                     double precision,
  p_formatted_address       text,
  p_icon                    text,
  p_tz                      text,
  p_region                  text,
  p_locality                text,
  p_tz_disambig_transit_id  uuid,
  p_tz_disambig_side        text
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
    p_note, p_paid_at, p_split_member_ids, v_place_id, p_tz,
    p_tz_disambig_transit_id, p_tz_disambig_side
  );
end;
$body$;

revoke all on function public.create_expense_with_place(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, double precision, double precision, text, text, text, text, text, uuid, text
) from public;
grant execute on function public.create_expense_with_place(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, double precision, double precision, text, text, text, text, text, uuid, text
) to authenticated;

drop function if exists public.create_expense_with_freetext_place(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, uuid, text, text
);

create or replace function public.create_expense_with_freetext_place(
  p_trip_id                 text,
  p_local_price             numeric,
  p_local_currency          text,
  p_rate_to_default         numeric,
  p_category_id             uuid,
  p_payer_member_id         uuid,
  p_visibility              text,
  p_splittable              boolean,
  p_note                    text,
  p_paid_at                 timestamp,
  p_split_member_ids        uuid[],
  p_place_name              text,
  p_tz                      text,
  p_tz_disambig_transit_id  uuid,
  p_tz_disambig_side        text
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

  v_place_id := public.find_or_create_trip_freetext_place(
    p_trip_id, v_member_id, p_place_name
  );

  return public.create_expense(
    p_trip_id, p_local_price, p_local_currency, p_rate_to_default,
    p_category_id, p_payer_member_id, p_visibility, p_splittable,
    p_note, p_paid_at, p_split_member_ids, v_place_id, p_tz,
    p_tz_disambig_transit_id, p_tz_disambig_side
  );
end;
$body$;

revoke all on function public.create_expense_with_freetext_place(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, uuid, text
) from public;
grant execute on function public.create_expense_with_freetext_place(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, uuid, text
) to authenticated;
