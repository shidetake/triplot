-- events: スケジュール（週ビュー）対応へ再設計
--
-- 設計の核心 — 「壁時計（floating time）」モデル:
--  - イベント時刻は「現地の壁時計の時刻＋そのTZ」で持つ。絶対時刻(UTC)＋表示時に
--    デバイスTZへ変換、はやらない。これをやるとアプリを見る場所/端末のTZ設定で
--    表示がズレる（日本で立てた現地19時の予定が、旅行中に見たら朝9時になる等）。
--    それを構造的に殺すため start_at / end_at は timestamp（TZ無し＝壁時計）。
--    どのTZの壁時計かは start_tz / end_tz に IANA 名で別持ち。描画は Intl に
--    timeZone を明示固定するので、端末/サーバの設定は一切入り込まない。
--  - kind:
--      'normal'  … 通常の時刻あり or 終日（all_day）イベント。end_tz は使わない
--                  （= start_tz と同じTZ）。
--      'transit' … フライト等の移動。出発(start_at,start_tz)→到着(end_at,end_tz)で
--                  TZ を跨ぐ。カレンダーはこの日だけ等幅2列＋リボンで描く。
--  - all_day … true なら日付ベース（start_at/end_at の日付部だけ使う。連日バー可）。
--               transit との併用は不可。
--  - place_id … 既存 places への任意リンク（同 trip 内のみ）。
--
-- trips.time_zone … その旅行の既定TZ。イベント作成時の start_tz 既定値に使う。
--
-- 開発中のため backfill は書かない。型変更のため先頭で events を一掃する。

-- ────────────────────────────────────────────────────────────
-- 既存 events 一掃（timestamptz → timestamp の型変更のため。dev 運用）
-- ────────────────────────────────────────────────────────────
truncate table events cascade;

-- ────────────────────────────────────────────────────────────
-- trips: 旅行の既定TZ
-- ────────────────────────────────────────────────────────────
alter table trips
  add column time_zone text not null default 'Asia/Tokyo';

-- ────────────────────────────────────────────────────────────
-- events: 壁時計モデルへ。timestamptz の旧2列を落として作り直す
-- （start_at の index は列ごと落ちるので後で作り直す）
-- ────────────────────────────────────────────────────────────
drop index if exists events_trip_start_idx;

alter table events drop column start_at;
alter table events drop column end_at;

alter table events
  add column kind     text      not null default 'normal'
                        check (kind in ('normal', 'transit')),
  add column all_day  boolean   not null default false,
  add column start_at timestamp not null,
  add column end_at   timestamp,
  add column start_tz text      not null,
  add column end_tz   text;

-- transit は出発/到着が必須・終日不可。end_at は start_at 以上。
-- 終日は normal 限定。
alter table events
  add constraint events_transit_endpoints_chk
    check (
      kind <> 'transit'
      or (end_at is not null and end_tz is not null and all_day = false)
    ),
  add constraint events_allday_normal_chk
    check (not all_day or kind = 'normal'),
  add constraint events_end_after_start_chk
    check (end_at is null or end_at >= start_at);

create index events_trip_start_idx
  on events (trip_id, visibility, start_at);

-- ────────────────────────────────────────────────────────────
-- create_event：イベントを 1 件作る。SECURITY DEFINER で RLS を
-- バイパスし、関数の入口で auth.uid() と trip 参加を確認する
-- （create_place / create_expense と同じパターン）。
--
-- ルール:
--  - 呼び出し者は trip のアクティブメンバー。created_by_member_id は本人。
--  - kind='transit' は end_at / end_tz 必須、all_day 不可。
--  - all_day は normal 限定。end_at 未指定なら start_at と同日扱い。
--  - normal は end_tz を使わない（= start_tz）。NULL に正規化して保存。
--  - place_id を渡すなら同 trip の places であること。
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

  if v_end_at is not null and v_end_at < p_start_at then
    raise exception 'end must be at or after start';
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

-- ────────────────────────────────────────────────────────────
-- update_event：イベント1件を更新。SECURITY DEFINER で RLS を
-- バイパスするため events_update ポリシーと同じ条件を関数内で再現する
-- （update_place と同じ：private は作成者のみ、shared→private も作成者のみ）。
-- 地点（place_id）は付け替え可。
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

  if v_end_at is not null and v_end_at < p_start_at then
    raise exception 'end must be at or after start';
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
