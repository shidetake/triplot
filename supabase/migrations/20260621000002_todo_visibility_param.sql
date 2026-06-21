-- 手動追加の TODO も private で作れるようにする。
-- todos.visibility は 20260621000001 で追加済み（予約TODO が予定の公開範囲を継承する用）。
-- これまで create_todo は visibility を受けず常に shared 既定だったので、p_visibility を足す。
-- 開発中につき後方互換は作らない（フロントと同時デプロイ）。古い4引数版は drop する。
drop function if exists public.create_todo(text, text, text, text);

create or replace function public.create_todo(
  p_trip_id    text,
  p_title      text,
  p_priority   text,
  p_kind       text,
  p_visibility text
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
  if p_visibility not in ('shared', 'private') then
    raise exception 'invalid visibility';
  end if;

  select id into v_my_member_id
  from trip_members
  where trip_id = p_trip_id
    and user_id = v_uid
    and left_at is null;

  if v_my_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  insert into todos (trip_id, created_by_member_id, title, priority, kind, visibility)
  values (p_trip_id, v_my_member_id, trim(p_title), p_priority, p_kind, p_visibility)
  returning id into v_todo_id;

  update trips set last_activity_at = now() where id = p_trip_id;

  return v_todo_id;
end;
$body$;

revoke all on function public.create_todo(text, text, text, text, text) from public;
grant execute on function public.create_todo(text, text, text, text, text) to authenticated;
