-- 予定に「出発地」と「到着地」の2つの場所を持たせる。
--
-- 移動（成田→ホノルル、東京→大阪）は旅行の予定として当たり前に存在するのに、
-- events が場所を1つしか持てなかった。到着地を表現できず、週カレンダーの
-- 到着側ブロックにも場所を出せなかった。
--
-- **end_place_id が NULL なら「開始と同じ場所」を意味する**（レストランでの食事は
-- 開始も終了もその店）。両方に同じ値を入れる二重管理にはしない。「通常予定なら
-- 開始と終了は同じ」という CHECK では守れないため（東京→大阪の移動は時差が無い＝
-- kind='normal' だが場所は違う）、事実を1箇所に置いて読む側で
-- coalesce(end_place_id, start_place_id) する方式を採る。
--
-- 読む側がこの coalesce を散らかさないよう、TS 側は packages/shared の
-- eventEndPlaceId() 1箇所に閉じ込める（SQL 側も同様に coalesce を使う）。

alter table events rename column place_id to start_place_id;

alter table events
  add column end_place_id uuid references places(id) on delete set null;

comment on column events.start_place_id is '出発地。単一地点の予定ではその場所';
comment on column events.end_place_id is
  '到着地。NULL は「start_place_id と同じ」の意味（二重に持たない）';

-- ────────────────────────────────────────────────────────────
-- 場所の指定を1つの jsonb にまとめる。
--
-- これまで場所の渡し方が3通り（既存id / Google / 自由入力）あり、その数だけ
-- RPC の変種が要った（create_event, create_event_with_place,
-- create_event_with_freetext_place …）。場所が2つになると 3×3 = 9 変種に
-- 膨れるので、指定方法を値で表して RPC を1本に畳む。
--
--   null                                → 場所なし
--   {"place_id": "<uuid>"}              → 既存の場所
--   {"google": {...}}                   → Google 由来（無ければ作る）
--   {"freetext": {"name": "..."}}       → 自由入力（無ければ作る）
--
-- 内部利用専用。authenticated には GRANT しない。
-- ────────────────────────────────────────────────────────────
create or replace function public.resolve_place_spec(
  p_trip_id    text,
  p_member_id  uuid,
  p_spec       jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
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
      p_trip_id, p_member_id, v_free ->> 'name'
    );
  end if;

  raise exception 'invalid place spec';
end;
$body$;

-- ────────────────────────────────────────────────────────────
-- create_event / update_event を1本ずつに統合する。
-- 旧シグネチャと変種はここで落とす（引数が変わるので replace では消えない）。
-- ────────────────────────────────────────────────────────────
drop function if exists public.create_event(text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, uuid, text, text, uuid[]);
drop function if exists public.create_event_with_place(text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text, text, text, double precision, double precision, text, text, text, text, uuid[]);
drop function if exists public.create_event_with_freetext_place(text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text, text, uuid[]);
drop function if exists public.update_event(uuid, text, text, boolean, timestamp, timestamp, text, text, uuid, text, uuid, text, text, uuid[]);
drop function if exists public.update_event_with_place(uuid, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text, text, text, double precision, double precision, text, text, text, text, uuid[]);
drop function if exists public.update_event_with_freetext_place(uuid, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text, text, uuid[]);

create or replace function public.create_event(
  p_trip_id                text,
  p_title                  text,
  p_kind                   text,
  p_all_day                boolean,
  p_start_at               timestamp,
  p_end_at                 timestamp,
  p_start_tz               text,
  p_end_tz                 text,
  p_tz_disambig_transit_id uuid,
  p_tz_disambig_side       text,
  p_start_place            jsonb,
  p_end_place              jsonb,
  p_visibility             text,
  p_note                   text,
  p_participant_member_ids uuid[]
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
$body$;

create or replace function public.update_event(
  p_event_id               uuid,
  p_title                  text,
  p_kind                   text,
  p_all_day                boolean,
  p_start_at               timestamp,
  p_end_at                 timestamp,
  p_start_tz               text,
  p_end_tz                 text,
  p_tz_disambig_transit_id uuid,
  p_tz_disambig_side       text,
  p_start_place            jsonb,
  p_end_place              jsonb,
  p_visibility             text,
  p_note                   text,
  p_participant_member_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
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
$body$;

-- ────────────────────────────────────────────────────────────
-- 候補 → 確定のトリガーを両端に効かせる。
-- （場所が1列だった時の 20260730000001 を置き換える）
-- ────────────────────────────────────────────────────────────
create or replace function public.confirm_place_on_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $body$
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
$body$;

-- 費用は場所が1つのままなので、専用の関数に分ける（列名が違うため）。
create or replace function public.confirm_place_on_expense_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $body$
begin
  update places
  set tentative = false
  where id = new.place_id
    and tentative
    and trip_id = new.trip_id;
  return new;
end;
$body$;

drop trigger if exists trg_confirm_place_on_event_link on events;

create trigger trg_confirm_place_on_event_link
  after insert or update of start_place_id, end_place_id on events
  for each row
  when (new.start_place_id is not null or new.end_place_id is not null)
  execute function public.confirm_place_on_link();

drop trigger if exists trg_confirm_place_on_expense_link on expenses;

create trigger trg_confirm_place_on_expense_link
  after insert or update of place_id on expenses
  for each row
  when (new.place_id is not null)
  execute function public.confirm_place_on_expense_link();

-- ────────────────────────────────────────────────────────────
-- copy_trip: 予定の複製で出発地・到着地の両方を写す。
-- ────────────────────────────────────────────────────────────
create or replace function public.copy_trip(p_source_trip_id text, p_title text, p_start_date date, p_end_date date, p_default_currency text, p_display_name text, p_events jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

;
