-- 予約管理: 予定に「要予約」を持たせ、立っていれば予約TODOを自動で紐づける。
--
-- 設計:
--  - 状態の真実は「予定に紐づく予約TODO」1件（todos.event_id）。予定側に
--    needs_reservation 列は持たない（二重管理を避ける）。予定の「要予約/予約済」
--    表示は紐づくTODOの有無と done からアプリ側で導出する。
--  - 予約TODOは優先度 high・タイトル「〇〇の予約」・作成者は予定の作成者。
--  - 予約TODOは共有TODOリストに出る。よって private 予定には作れない
--    （共有リストに private 予定のタイトルが漏れるため）。set_event_reservation で弾く。
--  - 予定削除時は event_id の on delete cascade で予約TODOも消える。

alter table todos
  add column event_id uuid references events(id) on delete cascade;

-- 予定1件につき予約TODOは最大1件
create unique index todos_event_uniq on todos (event_id) where event_id is not null;

-- set_event_reservation: 予定の「要予約」をトグルして予約TODOを同期する。
-- p_needs=true で予約TODOを作成（無ければ）、false で削除。予定の作成/更新後に
-- アプリ側から呼ぶ（イベントRPCとは独立して単独で原子的）。
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
  v_is_member boolean;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select trip_id, created_by_member_id, visibility, title
    into v_trip_id, v_creator, v_vis, v_title
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

  insert into todos (trip_id, created_by_member_id, title, priority, event_id)
  values (v_trip_id, v_creator, v_title || 'の予約', 'high', p_event_id);

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$body$;

revoke all on function public.set_event_reservation(uuid, boolean) from public;
grant execute on function public.set_event_reservation(uuid, boolean) to authenticated;
