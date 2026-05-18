-- events: 場所を place_id 一本化（Model B）。フリーテキストも places の行に。
--
-- 背景:
--  - これまで自由入力の場所は events.place_label に逃がしていた。places が
--    「必ず Google 由来・必ず地図に出る」固定だったため。前ステップで places
--    を 3 状態（Google由来/未マップ/手動ピン）に緩めたので、その前提は消えた。
--  - よって場所欄が何であろうと（保存済み/Google/自由入力）サーバ側で
--    place_id に解決して紐づける。events.place_label と XOR CHECK は撤去。
--    自由入力は「未マップ place」を find-or-create して再利用する。
--
-- 設計:
--  - find_or_create_trip_freetext_place: 同 trip・同名(大小無視)・未マップ・
--    shared の既存があれば再利用、無ければ「候補(tentative)」ステータスで
--    未マップ place を作成。Google 版 find_or_create_trip_place と対の内部
--    ヘルパ（authenticated に GRANT しない。SECURITY DEFINER 経由でのみ呼ぶ）。
--  - create_event / update_event は p_place_label を落として 11 引数に。
--    開発中につき後方互換 shim は作らず旧 12 引数版を drop して置換。
--  - create_event_with_place / update_event_with_place は内部の
--    create_event/update_event 呼び出しを 11 引数に追従（本体のみ差し替え）。
--  - 自由入力用に create_event_with_freetext_place /
--    update_event_with_freetext_place を新設（Google 版と同型）。
--
-- 開発中のため backfill は書かない。place_label に入っていた既存の自由入力
-- は列ごと消える（テストデータ。当該 event は place 無しになるだけ）。

-- ────────────────────────────────────────────────────────────
-- events.place_label と XOR CHECK を撤去
-- ────────────────────────────────────────────────────────────
alter table events drop constraint if exists events_place_xor_label_chk;
alter table events drop column if exists place_label;

-- ────────────────────────────────────────────────────────────
-- 旧 create_event / update_event（12 引数）を drop して 11 引数で作り直す
-- ────────────────────────────────────────────────────────────
drop function if exists public.create_event(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text
);
drop function if exists public.update_event(
  uuid, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text
);

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

revoke all on function public.create_event(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text
) from public;
grant execute on function public.create_event(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text
) to authenticated;

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
  -- （events_update の with check と同条件）。
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

revoke all on function public.update_event(
  uuid, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text
) from public;
grant execute on function public.update_event(
  uuid, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text
) to authenticated;

-- ────────────────────────────────────────────────────────────
-- create_event_with_place / update_event_with_place:
-- 内部の create_event/update_event 呼び出しを 11 引数に追従（本体のみ差替）。
-- シグネチャは不変なので GRANT は据え置き（create or replace で維持される）。
-- ────────────────────────────────────────────────────────────
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
  p_icon              text
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
    p_lat, p_lng, p_formatted_address, p_icon
  );

  return public.create_event(
    p_trip_id, p_title, p_kind, p_all_day, p_start_at, p_end_at,
    p_start_tz, p_end_tz, v_place_id, p_visibility, p_note
  );
end;
$body$;

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
  p_icon              text
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
    p_lat, p_lng, p_formatted_address, p_icon
  );

  perform public.update_event(
    p_event_id, p_title, p_kind, p_all_day, p_start_at, p_end_at,
    p_start_tz, p_end_tz, v_place_id, p_visibility, p_note
  );
end;
$body$;

-- ────────────────────────────────────────────────────────────
-- find_or_create_trip_freetext_place: 自由入力の場所を「同 trip に既に
-- あれば再利用、無ければ未マップ・候補で作成」して place_id を返す内部
-- ヘルパ（Google 版 find_or_create_trip_place と対）。
--
-- - 内部利用専用。authenticated には GRANT しない。
-- - 重複判定 = 同 trip・未マップ(lat is null)・shared・同名(大小無視)。
--   private を勝手に再利用すると公開範囲が漏れるので shared のみ。
-- - 作成する場所は常に shared・「候補(tentative)」ステータス。座標も
--   gpid も住所も持たない（後で地図ピンを設定できる＝後続ステップ）。
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
  v_status_id uuid;
  v_place_id  uuid;
begin
  if v_name is null then
    raise exception 'name required';
  end if;

  -- 既存の未マップ shared place を再利用（重複を作らない）
  select id into v_place_id
  from places
  where trip_id = p_trip_id
    and lat is null
    and visibility = 'shared'
    and lower(name) = lower(v_name)
  order by created_at
  limit 1;

  if v_place_id is not null then
    return v_place_id;
  end if;

  -- 候補（tentative=true）。seed 済みなら必ず 1 件ある
  select id into v_status_id
  from place_statuses
  where trip_id = p_trip_id
    and tentative = true
  order by sort_order
  limit 1;

  if v_status_id is null then
    raise exception 'tentative status not found for this trip';
  end if;

  insert into places (
    trip_id, created_by_member_id, visibility, google_place_id,
    name, lat, lng, status_id, note, formatted_address, icon
  )
  values (
    p_trip_id, p_member_id, 'shared', null,
    v_name, null, null, v_status_id, null, null, '📍'
  )
  returning id into v_place_id;

  return v_place_id;
end;
$body$;

revoke all on function public.find_or_create_trip_freetext_place(
  text, uuid, text
) from public;

-- ────────────────────────────────────────────────────────────
-- create_event_with_freetext_place / update_event_with_freetext_place:
-- 自由入力から選んだ場合。未マップ place を作成（or 再利用）→ その
-- place_id で予定を作成/更新、を 1 Tx で。予定側の検証は委譲する。
-- ────────────────────────────────────────────────────────────
create or replace function public.create_event_with_freetext_place(
  p_trip_id     text,
  p_title       text,
  p_kind        text,
  p_all_day     boolean,
  p_start_at    timestamp,
  p_end_at      timestamp,
  p_start_tz    text,
  p_end_tz      text,
  p_visibility  text,
  p_note        text,
  p_place_name  text
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
    p_start_tz, p_end_tz, v_place_id, p_visibility, p_note
  );
end;
$body$;

revoke all on function public.create_event_with_freetext_place(
  text, text, text, boolean, timestamp, timestamp, text, text, text, text, text
) from public;
grant execute on function public.create_event_with_freetext_place(
  text, text, text, boolean, timestamp, timestamp, text, text, text, text, text
) to authenticated;

create or replace function public.update_event_with_freetext_place(
  p_event_id    uuid,
  p_title       text,
  p_kind        text,
  p_all_day     boolean,
  p_start_at    timestamp,
  p_end_at      timestamp,
  p_start_tz    text,
  p_end_tz      text,
  p_visibility  text,
  p_note        text,
  p_place_name  text
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

  v_place_id := public.find_or_create_trip_freetext_place(
    v_trip_id, v_member_id, p_place_name
  );

  perform public.update_event(
    p_event_id, p_title, p_kind, p_all_day, p_start_at, p_end_at,
    p_start_tz, p_end_tz, v_place_id, p_visibility, p_note
  );
end;
$body$;

revoke all on function public.update_event_with_freetext_place(
  uuid, text, text, boolean, timestamp, timestamp, text, text, text, text, text
) from public;
grant execute on function public.update_event_with_freetext_place(
  uuid, text, text, boolean, timestamp, timestamp, text, text, text, text, text
) to authenticated;
