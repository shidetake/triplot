-- タイムゾーンの完全な参照化。
--
-- 前回の migration（20260702000001）は「旅程に transit が無い旅行だけ、通常予定/費用が
-- 実TZ文字列を literal 保存する」という例外を残していた。これを無くし、通常予定・費用は
-- 常に「乗継への参照（乗継当日のみ）」または「何も持たない（それ以外の日は自動導出）」の
-- どちらかだけにする。
--
-- 乗継が1つも無い旅行の唯一の拠り所として trips.default_timezone を追加する。
--  - ユーザーには見えない・変更UIも無い。最初の予定/費用作成時にブラウザのTZで
--    一度だけ自動セット、以後は据え置き（旅行全体の「公式なTZ設定」ではなく、
--    あくまで「他に手がかりが無い時の最後の拠り所」という狭い役割）。
--  - これにより「旅程にある乗継を全部消すと既存予定がUTC扱いになる」という
--    前回の設計の穴も副産物的に解消する（fallback先が常に安定して存在するため）。
--
-- 開発中につき backfill は書かない。既存データ（テスト用）は truncate。

truncate table events cascade;
truncate table expenses cascade;

alter table trips
  add column default_timezone text;

alter table events
  add constraint events_normal_no_literal_tz_chk
    check (kind = 'transit' or (start_tz is null and end_tz is null));

alter table expenses
  drop column tz;

-- ────────────────────────────────────────────────────────────
-- validate_tz_disambig: tz_disambig_transit_id/side の妥当性検証だけを行う
-- （前回の resolve_normal_event_tz は「保存方式を選ぶ」役目も持っていたが、
-- 通常予定/費用が常に参照のみになったので不要）。
-- ────────────────────────────────────────────────────────────

drop function if exists public.resolve_normal_event_tz(text, text, uuid, text);

create or replace function public.validate_tz_disambig(
  p_trip_id                 text,
  p_tz_disambig_transit_id  uuid,
  p_tz_disambig_side        text
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
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
$body$;

revoke all on function public.validate_tz_disambig(text, uuid, text) from public;
grant execute on function public.validate_tz_disambig(text, uuid, text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- seed_trip_default_timezone: 旅行の default_timezone が未設定なら
-- クライアントの現在のTZで一度だけ埋める。既に設定済みなら no-op。
-- ────────────────────────────────────────────────────────────

create or replace function public.seed_trip_default_timezone(
  p_trip_id    text,
  p_client_tz  text
)
returns void
language sql
security definer
set search_path = public
as $body$
  update trips
  set default_timezone = nullif(trim(p_client_tz), '')
  where id = p_trip_id and default_timezone is null;
$body$;

revoke all on function public.seed_trip_default_timezone(text, text) from public;
grant execute on function public.seed_trip_default_timezone(text, text) to authenticated;

-- ════════════════════════════════════════════════════════════
-- events 系 RPC の書き換え（create 系だけ p_client_tz を追加）
-- ════════════════════════════════════════════════════════════

drop function if exists public.create_event(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, uuid, text, text, uuid[]
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
  p_participant_member_ids  uuid[],
  p_client_tz               text
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
        raise exception 'arrival must be at or after departure';
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

  perform public.seed_trip_default_timezone(p_trip_id, p_client_tz);

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
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, uuid, text, text, uuid[], text
) from public;
grant execute on function public.create_event(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, uuid, text, text, uuid[], text
) to authenticated;

drop function if exists public.update_event(
  uuid, text, text, boolean, timestamp, timestamp, text, text, uuid, text, uuid, text, text, uuid[]
);

create or replace function public.update_event(
  p_event_id                uuid,
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
  v_end_at               timestamp := p_end_at;
  v_end_tz               text;
  v_store_start_tz        text;
  v_disambig_transit_id   uuid;
  v_disambig_side         text;
  v_place_ok             boolean;
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

  if p_place_id is not null then
    select exists (
      select 1 from places
      where id = p_place_id and trip_id = v_trip_id
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
      place_id   = p_place_id,
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

revoke all on function public.update_event(
  uuid, text, text, boolean, timestamp, timestamp, text, text, uuid, text, uuid, text, text, uuid[]
) from public;
grant execute on function public.update_event(
  uuid, text, text, boolean, timestamp, timestamp, text, text, uuid, text, uuid, text, text, uuid[]
) to authenticated;

-- ────────────────────────────────────────────────────────────
-- ラッパー（place 連携系）。create 系だけ p_client_tz を末尾に追加。
-- ────────────────────────────────────────────────────────────

drop function if exists public.create_event_with_place(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text,
  text, text, double precision, double precision, text, text, text, text, uuid[]
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
  p_participant_member_ids  uuid[],
  p_client_tz               text
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
    v_place_id, p_visibility, p_note, p_participant_member_ids, p_client_tz
  );
end;
$body$;

revoke all on function public.create_event_with_place(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text,
  text, text, double precision, double precision, text, text, text, text, uuid[], text
) from public;
grant execute on function public.create_event_with_place(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text,
  text, text, double precision, double precision, text, text, text, text, uuid[], text
) to authenticated;

drop function if exists public.update_event_with_place(
  uuid, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text,
  text, text, double precision, double precision, text, text, text, text, uuid[]
);

create or replace function public.update_event_with_place(
  p_event_id                uuid,
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

  select trip_id into v_trip_id from events where id = p_event_id;
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
    p_start_tz, p_end_tz, p_tz_disambig_transit_id, p_tz_disambig_side,
    v_place_id, p_visibility, p_note, p_participant_member_ids
  );
end;
$body$;

revoke all on function public.update_event_with_place(
  uuid, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text,
  text, text, double precision, double precision, text, text, text, text, uuid[]
) from public;
grant execute on function public.update_event_with_place(
  uuid, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text,
  text, text, double precision, double precision, text, text, text, text, uuid[]
) to authenticated;

drop function if exists public.create_event_with_freetext_place(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text, text, uuid[]
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
  p_participant_member_ids  uuid[],
  p_client_tz               text
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
    v_place_id, p_visibility, p_note, p_participant_member_ids, p_client_tz
  );
end;
$body$;

revoke all on function public.create_event_with_freetext_place(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text, text, uuid[], text
) from public;
grant execute on function public.create_event_with_freetext_place(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text, text, uuid[], text
) to authenticated;

drop function if exists public.update_event_with_freetext_place(
  uuid, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text, text, uuid[]
);

create or replace function public.update_event_with_freetext_place(
  p_event_id                uuid,
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

  select trip_id into v_trip_id from events where id = p_event_id;
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

  v_place_id := public.find_or_create_trip_freetext_place(
    v_trip_id, v_member_id, p_place_name
  );

  perform public.update_event(
    p_event_id, p_title, p_kind, p_all_day, p_start_at, p_end_at,
    p_start_tz, p_end_tz, p_tz_disambig_transit_id, p_tz_disambig_side,
    v_place_id, p_visibility, p_note, p_participant_member_ids
  );
end;
$body$;

revoke all on function public.update_event_with_freetext_place(
  uuid, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text, text, uuid[]
) from public;
grant execute on function public.update_event_with_freetext_place(
  uuid, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text, text, uuid[]
) to authenticated;

-- ════════════════════════════════════════════════════════════
-- expenses 系 RPC の書き換え。tz は保存せず occurred_at 計算にのみ使う。
-- create 系だけ p_client_tz を末尾に追加。
-- ════════════════════════════════════════════════════════════

drop function if exists public.create_expense(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], uuid, text, uuid, text
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
  p_tz_disambig_side        text,
  p_client_tz               text
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

  perform public.seed_trip_default_timezone(p_trip_id, p_client_tz);

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
  uuid[], uuid, text, uuid, text, text
) from public;
grant execute on function public.create_expense(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], uuid, text, uuid, text, text
) to authenticated;

drop function if exists public.update_expense(
  uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], uuid, text, uuid, text
);

create or replace function public.update_expense(
  p_expense_id              uuid,
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
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid              uuid := auth.uid();
  v_trip_id          text;
  v_creator          uuid;
  v_old_vis          text;
  v_is_member        boolean;
  v_is_creator       boolean;
  v_payer_ok         boolean;
  v_category_ok      boolean;
  v_place_ok         boolean;
  v_split_member_id  uuid;
  v_resolved_tz       text := nullif(trim(coalesce(p_tz, '')), '');
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

  select trip_id, created_by_member_id, visibility
    into v_trip_id, v_creator, v_old_vis
  from expenses
  where id = p_expense_id;

  if v_trip_id is null then
    raise exception 'expense not found';
  end if;

  perform public.validate_tz_disambig(v_trip_id, p_tz_disambig_transit_id, p_tz_disambig_side);

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

  select exists (
    select 1 from expense_categories
    where id = p_category_id
      and trip_id = v_trip_id
  ) into v_category_ok;
  if not v_category_ok then
    raise exception 'category does not belong to this trip';
  end if;

  if p_place_id is not null then
    select exists (
      select 1 from places
      where id = p_place_id and trip_id = v_trip_id
    ) into v_place_ok;
    if not v_place_ok then
      raise exception 'place does not belong to this trip';
    end if;
  end if;

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
      occurred_at     = (coalesce(p_paid_at, paid_at) at time zone v_resolved_tz),
      tz_disambig_transit_id = p_tz_disambig_transit_id,
      tz_disambig_side       = p_tz_disambig_side,
      place_id        = p_place_id
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
$body$;

revoke all on function public.update_expense(
  uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], uuid, text, uuid, text
) from public;
grant execute on function public.update_expense(
  uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], uuid, text, uuid, text
) to authenticated;

-- ────────────────────────────────────────────────────────────
-- ラッパー（place 連携系）。create 系だけ p_client_tz を末尾に追加。
-- ────────────────────────────────────────────────────────────

drop function if exists public.create_expense_with_place(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, double precision, double precision, text, text, text, text, text, uuid, text
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
  p_tz_disambig_side        text,
  p_client_tz               text
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
    p_tz_disambig_transit_id, p_tz_disambig_side, p_client_tz
  );
end;
$body$;

revoke all on function public.create_expense_with_place(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, double precision, double precision, text, text, text, text, text, uuid, text, text
) from public;
grant execute on function public.create_expense_with_place(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, double precision, double precision, text, text, text, text, text, uuid, text, text
) to authenticated;

drop function if exists public.update_expense_with_place(
  uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, double precision, double precision, text, text, text, text, text, uuid, text
);

create or replace function public.update_expense_with_place(
  p_expense_id              uuid,
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
    p_note, p_paid_at, p_split_member_ids, v_place_id, p_tz,
    p_tz_disambig_transit_id, p_tz_disambig_side
  );
end;
$body$;

revoke all on function public.update_expense_with_place(
  uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, double precision, double precision, text, text, text, text, text, uuid, text
) from public;
grant execute on function public.update_expense_with_place(
  uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, double precision, double precision, text, text, text, text, text, uuid, text
) to authenticated;

drop function if exists public.create_expense_with_freetext_place(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, uuid, text
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
  p_tz_disambig_side        text,
  p_client_tz               text
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
    p_tz_disambig_transit_id, p_tz_disambig_side, p_client_tz
  );
end;
$body$;

revoke all on function public.create_expense_with_freetext_place(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, uuid, text, text
) from public;
grant execute on function public.create_expense_with_freetext_place(
  text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, uuid, text, text
) to authenticated;

drop function if exists public.update_expense_with_freetext_place(
  uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, uuid, text
);

create or replace function public.update_expense_with_freetext_place(
  p_expense_id              uuid,
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

  v_place_id := public.find_or_create_trip_freetext_place(
    v_trip_id, v_member_id, p_place_name
  );

  perform public.update_expense(
    p_expense_id, p_local_price, p_local_currency, p_rate_to_default,
    p_category_id, p_payer_member_id, p_visibility, p_splittable,
    p_note, p_paid_at, p_split_member_ids, v_place_id, p_tz,
    p_tz_disambig_transit_id, p_tz_disambig_side
  );
end;
$body$;

revoke all on function public.update_expense_with_freetext_place(
  uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, uuid, text
) from public;
grant execute on function public.update_expense_with_freetext_place(
  uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp,
  uuid[], text, text, uuid, text
) to authenticated;

-- ════════════════════════════════════════════════════════════
-- copy_trip: 新旅行の default_timezone をコピー元から引き継ぐ。
-- 予定のTZは今まで通り（normal は常に null になるので特別扱い不要）。
-- ════════════════════════════════════════════════════════════

drop function if exists public.copy_trip(text, text, date, date, text, text, jsonb);

create or replace function public.copy_trip(
  p_source_trip_id     text,
  p_title              text,
  p_start_date         date,
  p_end_date           date,
  p_default_currency   text,
  p_display_name       text,
  p_events              jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $body$
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
    v_place_key := ev->>'place_id';
    if v_place_key is null then
      v_new_place := null;
    else
      v_new_place := nullif(v_place_map->>v_place_key, '')::uuid;
    end if;

    insert into events (
      trip_id, created_by_member_id, visibility, kind, all_day,
      title, start_at, end_at, start_tz, end_tz,
      tz_disambig_transit_id, tz_disambig_side, place_id, note
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
      v_new_place,
      nullif(trim(coalesce(ev->>'note', '')), '')
    );
  end loop;

  return v_trip_id;
end;
$body$;

revoke all on function public.copy_trip(text, text, date, date, text, text, jsonb) from public;
grant execute on function public.copy_trip(text, text, date, date, text, text, jsonb) to authenticated;
