-- 予約TODOのタイトルに予定の日付を前置する（例: 「4/28 レイカーズの予約」）。
-- 同名・別日（4/28 と 4/29 のレイカーズ、同じ店に複数回 等）を区別するため。
-- 日付は予定の開始日（start_at::date）。シグネチャ不変なので create or replace のみ
-- （grant は維持される）。

create or replace function public.set_event_reservation(
  p_event_id uuid,
  p_needs    boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid       uuid := auth.uid();
  v_trip_id   text;
  v_creator   uuid;
  v_vis       text;
  v_title     text;
  v_start_at  timestamp;
  v_is_member boolean;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select trip_id, created_by_member_id, visibility, title, start_at
    into v_trip_id, v_creator, v_vis, v_title, v_start_at
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

  -- 解除: 紐づく予約TODOを消す（done でも消す＝「もう予約不要」）
  if not p_needs then
    delete from todos where event_id = p_event_id;
    return;
  end if;

  -- 設定: 共有予定のみ（private は共有リストに漏れるため不可）
  if v_vis <> 'shared' then
    raise exception 'reservation is only for shared events';
  end if;

  -- 既に予約TODOがあれば何もしない（優先度/タイトル/done を保持）
  if exists (select 1 from todos where event_id = p_event_id) then
    return;
  end if;

  -- 日付を前置（FM で先頭ゼロを落とす → "4/28"）
  insert into todos (trip_id, created_by_member_id, title, priority, event_id)
  values (
    v_trip_id, v_creator,
    to_char(v_start_at::date, 'FMMM/FMDD') || ' ' || v_title || 'の予約',
    'high', p_event_id
  );

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$body$;
