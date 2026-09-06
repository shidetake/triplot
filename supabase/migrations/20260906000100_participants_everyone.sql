-- 予定の「全員参加」を、参加者テーブルの**行が無いこと**から推測するのを
-- やめ、事実として持つ。
--
-- これまでは event_participants が0行なら全員参加とみなしていた。この形は
-- 「全員参加のつもり」「まだ書いていない」「バグで消えた」が原理的に区別
-- できず、**壊れ方が静か**になる（2人の予定が全員参加に化けても、エラーに
-- ならずもっともらしい別の状態になるだけ。旅行コピーは0行を全員参加と見て
-- コピー対象にするので、消えた予定が勝手に紛れ込む）。
--
-- 参加者テーブル自体はそのまま。M:N はこれが正しい形で、配列カラムでは
-- 要素ごとに外部キーを張れず、存在しないメンバー ID が紛れ込んでも DB が
-- 止められない。変えるのは「全員かどうか」の持ち方だけ。
--
-- 同じ判断を費用の割り勘にも展開する（expenses.split_everyone）。金額は
-- 静かに壊れると気付けないので、まずこちらで形を固める。
--
-- 「一部の人なのに誰も居ない」は2つのテーブルにまたがるので CHECK では
-- 書けない。create_event / update_event が入口で弾く（参加者が実在の
-- アクティブメンバーかを既に検証しているのと同じ場所）。

alter table public.events
  add column if not exists participants_everyone boolean not null default true;

-- 引数が増えるので旧シグネチャは落とす（開発中は互換 shim を作らない方針）。
drop function if exists public.create_event(text, text, text, boolean, timestamp without time zone, timestamp without time zone, text, text, uuid, text, jsonb, jsonb, text, text, uuid[]);
drop function if exists public.update_event(uuid, text, text, boolean, timestamp without time zone, timestamp without time zone, text, text, uuid, text, jsonb, jsonb, text, text, uuid[]);

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
    -- private は参加者の概念を持たないので常に everyone 扱い。
    p_visibility <> 'shared' or p_participants_everyone
  )
  returning id into v_event_id;

  if p_visibility = 'shared' and not p_participants_everyone then
    insert into event_participants (event_id, member_id)
    select v_event_id, m
    from unnest(p_participant_member_ids) as m;
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
      participants_everyone = (p_visibility <> 'shared' or p_participants_everyone)
  where id = p_event_id;

  delete from event_participants where event_id = p_event_id;
  if p_visibility = 'shared' and not p_participants_everyone then
    insert into event_participants (event_id, member_id)
    select p_event_id, m
    from unnest(p_participant_member_ids) as m;
  end if;

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$$;

grant execute on function public.create_event(text, text, text, boolean, timestamp without time zone, timestamp without time zone, text, text, uuid, text, jsonb, jsonb, text, text, boolean, uuid[]) to authenticated;
grant execute on function public.update_event(uuid, text, text, boolean, timestamp without time zone, timestamp without time zone, text, text, uuid, text, jsonb, jsonb, text, text, boolean, uuid[]) to authenticated;
