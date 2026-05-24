-- TODO を「準備(prep)」「現地(onsite)」の大項目で分ける。
-- 準備ミスはダメージが大きいのでトップレベルで分離する。固定2値なので
-- CHECK 制約で持つ（priority と同列。trip ごとに変えないのでテーブル化はしない）。
-- 予約TODO（予定紐づき）は常に準備(prep)。

alter table todos
  add column kind text not null
    check (kind in ('prep', 'onsite'))
    default 'prep';

-- create_todo: kind を受け取る（シグネチャ変更 → drop して作り直し。開発中につき
-- 後方互換 shim は作らない）。
drop function if exists public.create_todo(text, text, text);

create or replace function public.create_todo(
  p_trip_id   text,
  p_title     text,
  p_priority  text,
  p_kind      text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid          uuid := auth.uid();
  v_my_member_id uuid;
  v_todo_id      uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'title required';
  end if;
  if p_priority not in ('high', 'medium', 'low') then
    raise exception 'invalid priority';
  end if;
  if p_kind not in ('prep', 'onsite') then
    raise exception 'invalid kind';
  end if;

  select id into v_my_member_id
  from trip_members
  where trip_id = p_trip_id
    and user_id = v_uid
    and left_at is null;

  if v_my_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  insert into todos (trip_id, created_by_member_id, title, priority, kind)
  values (p_trip_id, v_my_member_id, trim(p_title), p_priority, p_kind)
  returning id into v_todo_id;

  update trips set last_activity_at = now() where id = p_trip_id;

  return v_todo_id;
end;
$body$;

revoke all on function public.create_todo(text, text, text, text) from public;
grant execute on function public.create_todo(text, text, text, text) to authenticated;

-- set_event_reservation: 予約TODOは常に準備(prep)で作る（kind を明示）。
-- それ以外は 20260524000003 と同じ（日付前置・共有限定）。
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

  if v_vis <> 'shared' then
    raise exception 'reservation is only for shared events';
  end if;

  if exists (select 1 from todos where event_id = p_event_id) then
    return;
  end if;

  insert into todos (trip_id, created_by_member_id, title, priority, kind, event_id)
  values (
    v_trip_id, v_creator,
    to_char(v_start_at::date, 'FMMM/FMDD') || ' ' || v_title || 'の予約',
    'high', 'prep', p_event_id
  );

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$body$;
