-- ────────────────────────────────────────────────────────────
-- event_participants（予定の参加者の部分集合）
-- ────────────────────────────────────────────────────────────
-- shared な予定で「全員ではなく一部メンバーだけが参加」を表す。
-- 0 件 = 全員参加。明示参加者を入れたい時だけ行を持つ。
-- private な予定は作成者本人だけが当事者なので event_participants は書かない
-- （書いてもムダになる）。
--
-- 既存の expense_splits と同じ M:N パターン。member_id は trip_members.id（uuid）。

drop table if exists event_participants cascade;

create table event_participants (
  event_id  uuid not null references events(id) on delete cascade,
  member_id uuid not null references trip_members(id) on delete cascade,
  primary key (event_id, member_id)
);

create index event_participants_member_idx on event_participants (member_id);

alter table event_participants enable row level security;

-- 親の event が見える人 = participants も見える。
-- 書き込みは create_event / update_event RPC（security definer）からのみ。
-- policy 未定義の INSERT/UPDATE/DELETE は RLS により reject される。
create policy event_participants_visible on event_participants for select
  using (
    exists (
      select 1 from events e
      where e.id = event_participants.event_id
        and (
          (e.visibility = 'shared'
            and public.is_active_trip_member(e.trip_id))
          or (e.visibility = 'private'
            and exists (
              select 1 from trip_members tm
              where tm.id = e.created_by_member_id and tm.user_id = auth.uid()
            ))
        )
    )
  );

-- ────────────────────────────────────────────────────────────
-- create_event / update_event を参加者対応に差し替え
-- ────────────────────────────────────────────────────────────
-- 旧シグネチャを drop して新シグネチャで作り直す（DEFAULT で互換 shim は持た
-- ない方針＝rpc_signature_compat。シグネチャ変更で本番が一瞬壊れても、フロント
-- 即デプロイで復帰）。
--
-- 参加者の渡し方:
--   p_participant_member_ids = null   → 全員（行を作らない）
--   p_participant_member_ids = '{}'   → 全員（行を作らない、null と同義）
--   p_participant_member_ids = '{a,b}' → メンバー a, b のみ
-- private 指定時は p_participant_member_ids を無視（行は作らない）。

drop function if exists public.create_event(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text
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
  v_uid           uuid := auth.uid();
  v_my_member_id  uuid;
  v_event_id      uuid;
  v_end_at        timestamp := p_end_at;
  v_end_tz        text;
  v_place_ok      boolean;
  v_bad_count     int;
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
  if coalesce(trim(p_start_tz), '') = '' then
    raise exception 'start_tz required';
  end if;
  if p_start_at is null then
    raise exception 'start_at required';
  end if;

  if p_kind = 'transit' then
    if p_all_day then
      raise exception 'transit cannot be all-day';
    end if;
    if p_end_at is null or coalesce(trim(p_end_tz), '') = '' then
      raise exception 'transit requires arrival time and timezone';
    end if;
    v_end_tz := trim(p_end_tz);
  else
    v_end_tz := null;
    if p_all_day and v_end_at is null then
      v_end_at := p_start_at;
    end if;
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

  -- shared 時のみ参加者をバリデート。全員 trip のアクティブメンバーであること。
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
    title, start_at, end_at, start_tz, end_tz, place_id, note
  )
  values (
    p_trip_id, v_my_member_id, p_visibility, p_kind, coalesce(p_all_day, false),
    trim(p_title), p_start_at, v_end_at, trim(p_start_tz), v_end_tz,
    p_place_id, nullif(trim(coalesce(p_note, '')), '')
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
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, uuid[]
) from public;
grant execute on function public.create_event(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, uuid[]
) to authenticated;

drop function if exists public.update_event(
  uuid, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text
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
  v_uid         uuid := auth.uid();
  v_trip_id     text;
  v_creator     uuid;
  v_old_vis     text;
  v_is_member   boolean;
  v_is_creator  boolean;
  v_end_at      timestamp := p_end_at;
  v_end_tz      text;
  v_place_ok    boolean;
  v_bad_count   int;
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
  if coalesce(trim(p_start_tz), '') = '' then
    raise exception 'start_tz required';
  end if;
  if p_start_at is null then
    raise exception 'start_at required';
  end if;

  if p_kind = 'transit' then
    if p_all_day then
      raise exception 'transit cannot be all-day';
    end if;
    if p_end_at is null or coalesce(trim(p_end_tz), '') = '' then
      raise exception 'transit requires arrival time and timezone';
    end if;
    v_end_tz := trim(p_end_tz);
  else
    v_end_tz := null;
    if p_all_day and v_end_at is null then
      v_end_at := p_start_at;
    end if;
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

  select trip_id, created_by_member_id, visibility
    into v_trip_id, v_creator, v_old_vis
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
      start_tz   = trim(p_start_tz),
      end_tz     = v_end_tz,
      place_id   = p_place_id,
      visibility = p_visibility,
      note       = nullif(trim(coalesce(p_note, '')), '')
  where id = p_event_id;

  -- 参加者は常に置き換え（前回値を保持しない）。
  -- private に切替えた／空配列なら、既存 participants を全削除して「全員 or 不要」状態に。
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
  uuid, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, uuid[]
) from public;
grant execute on function public.update_event(
  uuid, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, uuid[]
) to authenticated;

-- ────────────────────────────────────────────────────────────
-- ラッパー（place 連携系）も新シグネチャに合わせて差し替え
-- ────────────────────────────────────────────────────────────

drop function if exists public.create_event_with_place(
  text, text, text, boolean, timestamp, timestamp, text, text, text, text,
  text, text, double precision, double precision, text, text, text, text
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
    p_start_tz, p_end_tz, v_place_id, p_visibility, p_note,
    p_participant_member_ids
  );
end;
$body$;

revoke all on function public.create_event_with_place(
  text, text, text, boolean, timestamp, timestamp, text, text, text, text,
  text, text, double precision, double precision, text, text, text, text, uuid[]
) from public;
grant execute on function public.create_event_with_place(
  text, text, text, boolean, timestamp, timestamp, text, text, text, text,
  text, text, double precision, double precision, text, text, text, text, uuid[]
) to authenticated;

drop function if exists public.update_event_with_place(
  uuid, text, text, boolean, timestamp, timestamp, text, text, text, text,
  text, text, double precision, double precision, text, text, text, text
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
    p_start_tz, p_end_tz, v_place_id, p_visibility, p_note,
    p_participant_member_ids
  );
end;
$body$;

revoke all on function public.update_event_with_place(
  uuid, text, text, boolean, timestamp, timestamp, text, text, text, text,
  text, text, double precision, double precision, text, text, text, text, uuid[]
) from public;
grant execute on function public.update_event_with_place(
  uuid, text, text, boolean, timestamp, timestamp, text, text, text, text,
  text, text, double precision, double precision, text, text, text, text, uuid[]
) to authenticated;

drop function if exists public.create_event_with_freetext_place(
  text, text, text, boolean, timestamp, timestamp, text, text, text, text, text
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
    p_start_tz, p_end_tz, v_place_id, p_visibility, p_note,
    p_participant_member_ids
  );
end;
$body$;

revoke all on function public.create_event_with_freetext_place(
  text, text, text, boolean, timestamp, timestamp, text, text, text, text, text, uuid[]
) from public;
grant execute on function public.create_event_with_freetext_place(
  text, text, text, boolean, timestamp, timestamp, text, text, text, text, text, uuid[]
) to authenticated;

drop function if exists public.update_event_with_freetext_place(
  uuid, text, text, boolean, timestamp, timestamp, text, text, text, text, text
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
    p_start_tz, p_end_tz, v_place_id, p_visibility, p_note,
    p_participant_member_ids
  );
end;
$body$;

revoke all on function public.update_event_with_freetext_place(
  uuid, text, text, boolean, timestamp, timestamp, text, text, text, text, text, uuid[]
) from public;
grant execute on function public.update_event_with_freetext_place(
  uuid, text, text, boolean, timestamp, timestamp, text, text, text, text, text, uuid[]
) to authenticated;
