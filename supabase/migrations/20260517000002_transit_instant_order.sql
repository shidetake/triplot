-- 時差移動（transit）の「到着 ≧ 出発」判定を TZ 考慮（実時刻）に直す。
--
-- バグ: 終了≧開始チェックが壁時計の素の比較だったため、例えば
--   出発 NRT 4/28 09:00 (Asia/Tokyo) / 到着 HNL 4/28 07:25 (Pacific/Honolulu)
-- が「07:25 < 09:00」で弾かれていた。実時刻では
--   出発 = 4/28 00:00 UTC、到着 = 4/28 17:25 UTC で到着が後、なので正しい予定。
--
-- 方針:
--  - 通常 / 終日 は start_tz と end の実効TZが同じなので壁時計比較で正しい。
--  - transit のみ各TZで instant に直して比較する（`AT TIME ZONE` で
--    naive timestamp を当該TZの timestamptz に解釈）。
--  - テーブル CHECK は immutable に保ちたい（`timezone()` は stable）ので
--    transit を対象外にし、transit の順序は RPC 側で担保する。

-- ────────────────────────────────────────────────────────────
-- CHECK 制約: 素の比較は transit には不適。transit を除外する
-- ────────────────────────────────────────────────────────────
alter table events drop constraint events_end_after_start_chk;

alter table events
  add constraint events_normal_end_after_start_chk
    check (kind = 'transit' or end_at is null or end_at >= start_at);

-- ────────────────────────────────────────────────────────────
-- create_event: transit は実時刻で到着≧出発を判定
-- ────────────────────────────────────────────────────────────
create or replace function public.create_event(
  p_trip_id     text,
  p_title       text,
  p_kind        text,
  p_all_day     boolean,
  p_start_at    timestamp,
  p_end_at      timestamp,
  p_start_tz    text,
  p_end_tz      text,
  p_place_id    uuid,
  p_visibility  text,
  p_note        text
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
    -- normal は end_tz を使わない（= start_tz）
    v_end_tz := null;
    if p_all_day and v_end_at is null then
      v_end_at := p_start_at;
    end if;
  end if;

  if v_end_at is not null then
    if p_kind = 'transit' then
      -- 壁時計ではなく各TZの実時刻で比較（TZ跨ぎは現地時刻だけ見ると逆転する）
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

  update trips set last_activity_at = now() where id = p_trip_id;

  return v_event_id;
end;
$body$;

-- ────────────────────────────────────────────────────────────
-- update_event: 同じく transit は実時刻で判定
-- ────────────────────────────────────────────────────────────
create or replace function public.update_event(
  p_event_id    uuid,
  p_title       text,
  p_kind        text,
  p_all_day     boolean,
  p_start_at    timestamp,
  p_end_at      timestamp,
  p_start_tz    text,
  p_end_tz      text,
  p_place_id    uuid,
  p_visibility  text,
  p_note        text
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

  -- private は作成者のみ。shared→private も作成者のみ
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

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$body$;
