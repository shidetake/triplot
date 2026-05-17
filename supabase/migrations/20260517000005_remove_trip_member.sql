-- メンバーをトリップから外す（ソフト退会 = left_at セット）。
--
-- 方針: ロール/権限は設けない（MVP: 破壊的アクションも誰でも可）。
-- trip_members の RLS は「自分の行のみ」操作可なので、他人を外すには
-- DEFINER RPC が要る。アクティブメンバーなら誰でも（自分含め）外せる。
-- 外しても招待リンクから再参加すれば復活する（join_trip_via_invite が
-- left_at=null に戻す）ので可逆。

create or replace function public.remove_trip_member(
  p_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid       uuid := auth.uid();
  v_trip_id   text;
  v_is_member boolean;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select trip_id into v_trip_id
  from trip_members
  where id = p_member_id;

  if v_trip_id is null then
    raise exception 'member not found';
  end if;

  select exists (
    select 1 from trip_members
    where trip_id = v_trip_id and user_id = v_uid and left_at is null
  ) into v_is_member;

  if not v_is_member then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  update trip_members
  set left_at = now()
  where id = p_member_id and left_at is null;
end;
$body$;

revoke all on function public.remove_trip_member(uuid) from public;
grant execute on function public.remove_trip_member(uuid) to authenticated;
