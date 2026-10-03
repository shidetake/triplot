-- 自分だけの予定の参加者を「作った本人だけ」にする。
--
-- これまで自分だけの予定は「全員参加」として保存していた（参加者の概念を
-- 持たない扱い）。全員扱いだと、その予定（特に移動）が他のメンバーの年表にも
-- 入り、他の人からは見えない予定で年表が繋がらなくなり、付け忘れの警告が
-- 出ていた。自分だけの予定は本人の年表にだけ効くのが正しい。
--
-- 作成・更新の RPC が参加者を本人に決める（渡された参加者は使わない）ので、
-- 引数は変えない＝配布済みのアプリから保存しても正しく直る。

CREATE OR REPLACE FUNCTION "public"."create_event"("p_trip_id" "text", "p_title" "text", "p_kind" "text", "p_all_day" boolean, "p_start_at" timestamp without time zone, "p_end_at" timestamp without time zone, "p_start_tz" "text", "p_end_tz" "text", "p_tz_disambig_transit_id" "uuid", "p_tz_disambig_side" "text", "p_start_place" "jsonb", "p_end_place" "jsonb", "p_visibility" "text", "p_note" "text", "p_participants_everyone" boolean, "p_participant_member_ids" "uuid"[]) RETURNS "uuid"
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
  v_everyone             boolean;
  v_participant_ids      uuid[];
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

  -- 自分だけの予定の参加者は作った本人だけ（渡された参加者は使わない）。
  -- 全員扱いにすると、その予定（特に移動）が他のメンバーの年表にも入り、
  -- 他の人からは見えない予定で年表が繋がらなくなる。
  if p_visibility = 'private' then
    v_everyone := false;
    v_participant_ids := array[v_my_member_id];
  else
    v_everyone := p_participants_everyone;
    v_participant_ids := p_participant_member_ids;
  end if;

  -- 「全員参加」は participants_everyone が持つ。参加者の行は「一部の人」の
  -- ときだけ入れる。**行が無いことに意味を持たせない**（0行＝全員、という
  -- 推測をやめた。詳細は 20260906000100_participants_everyone.sql）。
  if p_visibility = 'shared' and not p_participants_everyone then
    if p_participant_member_ids is null
       or array_length(p_participant_member_ids, 1) is null then
      raise exception 'custom participants must not be empty';
    end if;
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
    start_place_id, end_place_id, note, participants_everyone
  )
  values (
    p_trip_id, v_my_member_id, p_visibility, p_kind, coalesce(p_all_day, false),
    trim(p_title), p_start_at, v_end_at, v_store_start_tz, v_end_tz,
    v_disambig_transit_id, v_disambig_side,
    v_start_place_id, v_end_place_id,
    nullif(trim(coalesce(p_note, '')), ''),
    v_everyone
  )
  returning id into v_event_id;

  if not v_everyone then
    insert into event_participants (event_id, member_id)
    select v_event_id, m
    from unnest(v_participant_ids) as m;
  end if;

  update trips set last_activity_at = now() where id = p_trip_id;

  return v_event_id;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."update_event"("p_event_id" "uuid", "p_title" "text", "p_kind" "text", "p_all_day" boolean, "p_start_at" timestamp without time zone, "p_end_at" timestamp without time zone, "p_start_tz" "text", "p_end_tz" "text", "p_tz_disambig_transit_id" "uuid", "p_tz_disambig_side" "text", "p_start_place" "jsonb", "p_end_place" "jsonb", "p_visibility" "text", "p_note" "text", "p_participants_everyone" boolean, "p_participant_member_ids" "uuid"[]) RETURNS "void"
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
  v_everyone            boolean;
  v_participant_ids     uuid[];
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

  -- 自分だけの予定の参加者は作った本人だけ（create_event と同じ）。
  -- 自分だけにできるのは作った本人だけなので、v_creator が本人。
  if p_visibility = 'private' then
    v_everyone := false;
    v_participant_ids := array[v_creator];
  else
    v_everyone := p_participants_everyone;
    v_participant_ids := p_participant_member_ids;
  end if;

  -- 「全員参加」は participants_everyone が持つ。参加者の行は「一部の人」の
  -- ときだけ入れる。**行が無いことに意味を持たせない**（0行＝全員、という
  -- 推測をやめた。詳細は 20260906000100_participants_everyone.sql）。
  if p_visibility = 'shared' and not p_participants_everyone then
    if p_participant_member_ids is null
       or array_length(p_participant_member_ids, 1) is null then
      raise exception 'custom participants must not be empty';
    end if;
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
      note       = nullif(trim(coalesce(p_note, '')), ''),
      participants_everyone = v_everyone
  where id = p_event_id;

  delete from event_participants where event_id = p_event_id;
  if not v_everyone then
    insert into event_participants (event_id, member_id)
    select p_event_id, m
    from unnest(v_participant_ids) as m;
  end if;

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$$;

-- 既存の自分だけの予定を、参加者＝作った本人だけに移す。予定そのものは
-- 変えない（他のメンバーには元々見えていないので、他の人の画面も変わらない）。
update public.events set participants_everyone = false
 where visibility = 'private';

delete from public.event_participants ep
 using public.events e
 where ep.event_id = e.id
   and e.visibility = 'private'
   and ep.member_id <> e.created_by_member_id;

insert into public.event_participants (event_id, member_id)
select id, created_by_member_id from public.events where visibility = 'private'
on conflict do nothing;
