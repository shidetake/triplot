-- 予約TODO を private 予定にも対応させる。
--
-- 変更前: 予約TODO は共有TODOリスト専用で、private 予定には作れなかった
--   （todos に visibility が無く、private 予定のタイトルが共有リストに漏れるため
--    set_event_reservation が private を弾いていた）。
-- 変更後: todos に visibility を持たせ、予約TODO は紐づく予定の公開範囲を継承する。
--   shared 予定の予約TODO → active member 全員に見える
--   private 予定の予約TODO → 作成者本人だけに見える
--   手書きの wishlist TODO は従来どおり共有（default 'shared'）。
-- RLS は他の trip 紐づきテーブル（places/events/expenses）と同じ visibility パターンに揃える。

alter table todos
  add column visibility text not null default 'shared'
    check (visibility in ('shared', 'private'));

-- RLS: shared = active member 全員、private = 作成者本人のみ。
-- 旧 todos_member_all（visibility 無視の全員可）を visibility パターンに差し替える。
drop policy if exists todos_member_all on todos;

create policy todos_visibility on todos for all
  using (
    (visibility = 'shared' and public.is_active_trip_member(trip_id))
    or (visibility = 'private' and public.is_own_member(created_by_member_id))
  )
  with check (
    (visibility = 'shared' and public.is_active_trip_member(trip_id))
    or (visibility = 'private' and public.is_own_member(created_by_member_id))
  );

-- set_event_reservation: 予約TODO に予定の visibility を継承させ、private 予定も許可する
-- （20260524000004 の定義をベースに、private を弾く分岐を削除＋visibility を同期）。
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

  if not p_needs then
    delete from todos where event_id = p_event_id;
    return;
  end if;

  -- 既に予約TODOがあれば visibility だけ予定に追従させる（タイトル/優先度/done は保持）。
  -- 予定の公開範囲を shared↔private と変えたとき、予約TODOの可視範囲もズレないように同期する。
  if exists (select 1 from todos where event_id = p_event_id) then
    update todos set visibility = v_vis where event_id = p_event_id;
    return;
  end if;

  insert into todos (trip_id, created_by_member_id, title, priority, kind, visibility, event_id)
  values (
    v_trip_id, v_creator,
    to_char(v_start_at::date, 'FMMM/FMDD') || ' ' || v_title || 'の予約',
    'high', 'prep', v_vis, p_event_id
  );

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$body$;

revoke all on function public.set_event_reservation(uuid, boolean) from public;
grant execute on function public.set_event_reservation(uuid, boolean) to authenticated;
