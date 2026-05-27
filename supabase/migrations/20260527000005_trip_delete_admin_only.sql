-- ────────────────────────────────────────────────────────────
-- 旅行削除を管理者だけに限定
-- ────────────────────────────────────────────────────────────
-- 旧 RLS: アクティブメンバーなら誰でも削除可能。
-- 新 RLS: 同 trip の is_admin = true なメンバーだけ削除可能。
-- アプリ側でも事前チェックして UI とエラーメッセージを揃える（actions.ts）。

create or replace function public.is_trip_admin(_trip_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from trip_members
    where trip_id = _trip_id
      and user_id = auth.uid()
      and left_at is null
      and is_admin = true
  );
$$;

revoke all on function public.is_trip_admin(text) from public;
grant execute on function public.is_trip_admin(text) to authenticated;

drop policy if exists trips_member_delete on trips;
create policy trips_member_delete on trips for delete
  using (public.is_trip_admin(id));
