-- ────────────────────────────────────────────────────────────
-- 旅行（trips）の更新は admin だけ
-- ────────────────────────────────────────────────────────────
-- タイトル・日程・精算通貨の編集を旅行詳細から admin が行えるようにする。
-- 削除は既に is_trip_admin で admin 限定（20260527000005）。更新も揃える。
-- last_activity_at 等を更新する各 RPC は SECURITY DEFINER なので RLS 非対象＝影響なし。
-- クライアントからの trips 直接更新は今この編集機能だけ。
drop policy if exists trips_member_update on trips;

create policy trips_admin_update on trips for update
  using (public.is_trip_admin(id))
  with check (public.is_trip_admin(id));
