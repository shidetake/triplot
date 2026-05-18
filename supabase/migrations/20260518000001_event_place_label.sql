-- スケジュールから場所を入れられるようにする（純増機能）。
--
-- 背景:
--  - これまで予定の場所は「保存済み places から選ぶ」だけだった。
--  - 追加で (a) Google サジェストから選ぶ → places に「確定」で作成して紐づけ、
--    (b) 完全フリーテキスト → places は作らず events.place_label に保持、
--    を選べるようにする。「場所」セクションの地図 UI 追加経路は無変更。
--
-- 設計:
--  - places は「必ず Google 由来・地図に出る」不変条件を維持したいので、
--    フリーテキストは places に入れず events.place_label（nullable）に持つ。
--  - place_id と place_label は排他（CHECK）。Google 由来は place_id、
--    フリーテキストは place_label。
--  - Google 由来は places への作成 + events への作成を 1 トランザクションで
--    やる必要があるので SECURITY DEFINER RPC（create_event_with_place /
--    update_event_with_place）。クライアントで insert を連鎖させない。
--  - 既存の create_event / update_event は引数が増える（p_place_label）。
--    開発中につき後方互換 shim は作らず旧シグネチャを drop して置換。
--
-- 開発中のため backfill は書かない（place_label は新列で既存行は NULL でよい）。

-- ────────────────────────────────────────────────────────────
-- events: フリーテキスト場所ラベル
-- ────────────────────────────────────────────────────────────
alter table events add column place_label text;

-- place_id（保存済み/Google 由来）と place_label（フリーテキスト）は排他。
alter table events
  add constraint events_place_xor_label_chk
    check (place_id is null or place_label is null);

-- ────────────────────────────────────────────────────────────
-- 旧 create_event / update_event（11 引数）を drop して 12 引数で作り直す
-- （p_place_label を追加。overload を残さない）
-- ────────────────────────────────────────────────────────────
drop function if exists public.create_event(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text
);
drop function if exists public.update_event(
  uuid, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text
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
  p_note        text,
  p_place_label text
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
  v_place_label   text := nullif(trim(coalesce(p_place_label, '')), '');
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

  -- place_id があるならフリーテキストは無視（place_id 優先・排他）
  if p_place_id is not null then
    v_place_label := null;
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
    title, start_at, end_at, start_tz, end_tz, place_id, place_label, note
  )
  values (
    p_trip_id, v_my_member_id, p_visibility, p_kind, coalesce(p_all_day, false),
    trim(p_title), p_start_at, v_end_at, trim(p_start_tz), v_end_tz,
    p_place_id, v_place_label, nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_event_id;

  update trips set last_activity_at = now() where id = p_trip_id;

  return v_event_id;
end;
$body$;

revoke all on function public.create_event(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text
) from public;
grant execute on function public.create_event(
  text, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text
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
  p_note        text,
  p_place_label text
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
  v_place_label text := nullif(trim(coalesce(p_place_label, '')), '');
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

  if p_place_id is not null then
    v_place_label := null;
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
  set title       = trim(p_title),
      kind        = p_kind,
      all_day     = coalesce(p_all_day, false),
      start_at    = p_start_at,
      end_at      = v_end_at,
      start_tz    = trim(p_start_tz),
      end_tz      = v_end_tz,
      place_id    = p_place_id,
      place_label = v_place_label,
      visibility  = p_visibility,
      note        = nullif(trim(coalesce(p_note, '')), '')
  where id = p_event_id;

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$body$;

revoke all on function public.update_event(
  uuid, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text
) from public;
grant execute on function public.update_event(
  uuid, text, text, boolean, timestamp, timestamp, text, text, uuid, text, text, text
) to authenticated;

-- ────────────────────────────────────────────────────────────
-- find_or_create_trip_place: Google 由来の場所を「同 trip に既にあれば
-- 再利用、無ければ確定ステータスで作成」して place_id を返す内部ヘルパ。
--
-- - 内部利用専用（create_event_with_place / update_event_with_place から
--   のみ呼ぶ）。authenticated には GRANT しない。呼び元が SECURITY DEFINER
--   で関数所有者(postgres)として実行するため、内部呼び出しは権限が通る。
-- - 確定ステータス = place_statuses.tentative = false（seed の「確定」）。
-- - 重複判定は「同 trip・同 google_place_id・shared」。private を勝手に
--   再利用すると公開範囲が漏れるので shared のみ再利用、無ければ新規。
-- - 作成する場所は常に shared（確定した実在の場所は全員に有用。予定自体の
--   公開範囲とは独立）。
-- ────────────────────────────────────────────────────────────
create or replace function public.find_or_create_trip_place(
  p_trip_id           text,
  p_member_id         uuid,
  p_google_place_id   text,
  p_name              text,
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
  v_gpid      text := nullif(trim(coalesce(p_google_place_id, '')), '');
  v_status_id uuid;
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

  -- 既存の shared place を再利用（重複ピンを作らない）
  select id into v_place_id
  from places
  where trip_id = p_trip_id
    and google_place_id = v_gpid
    and visibility = 'shared'
  order by created_at
  limit 1;

  if v_place_id is not null then
    return v_place_id;
  end if;

  -- 確定ステータス（tentative=false）。seed 済みなら必ず 1 件ある
  select id into v_status_id
  from place_statuses
  where trip_id = p_trip_id
    and tentative = false
  order by sort_order
  limit 1;

  if v_status_id is null then
    raise exception 'confirmed status not found for this trip';
  end if;

  insert into places (
    trip_id, created_by_member_id, visibility, google_place_id,
    name, lat, lng, status_id, note, formatted_address, icon
  )
  values (
    p_trip_id, p_member_id, 'shared', v_gpid,
    trim(p_name), p_lat, p_lng, v_status_id, null,
    trim(p_formatted_address),
    coalesce(nullif(trim(coalesce(p_icon, '')), ''), '📍')
  )
  returning id into v_place_id;

  return v_place_id;
end;
$body$;

revoke all on function public.find_or_create_trip_place(
  text, uuid, text, text, double precision, double precision, text, text
) from public;

-- ────────────────────────────────────────────────────────────
-- create_event_with_place: Google サジェストから選んだ場合。場所を
-- 確定で作成（or 再利用）→ その place_id で予定を作成、を 1 Tx で。
-- 予定作成のバリデーション/transit 判定は create_event に委譲する。
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
    p_start_tz, p_end_tz, v_place_id, p_visibility, p_note, null
  );
end;
$body$;

revoke all on function public.create_event_with_place(
  text, text, text, boolean, timestamp, timestamp, text, text, text, text,
  text, text, double precision, double precision, text, text
) from public;
grant execute on function public.create_event_with_place(
  text, text, text, boolean, timestamp, timestamp, text, text, text, text,
  text, text, double precision, double precision, text, text
) to authenticated;

-- ────────────────────────────────────────────────────────────
-- update_event_with_place: 既存予定の編集で Google サジェストから
-- 場所を選び直した場合。place 作成/再利用 → update_event に委譲。
-- 予定の編集権限チェックは update_event 側で行う。
-- ────────────────────────────────────────────────────────────
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
    p_start_tz, p_end_tz, v_place_id, p_visibility, p_note, null
  );
end;
$body$;

revoke all on function public.update_event_with_place(
  uuid, text, text, boolean, timestamp, timestamp, text, text, text, text,
  text, text, double precision, double precision, text, text
) from public;
grant execute on function public.update_event_with_place(
  uuid, text, text, boolean, timestamp, timestamp, text, text, text, text,
  text, text, double precision, double precision, text, text
) to authenticated;
