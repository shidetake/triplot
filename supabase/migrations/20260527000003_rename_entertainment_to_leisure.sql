-- ────────────────────────────────────────────────────────────
-- 「エンタメ」(celebration) → 「レジャー」(local_activity) リネーム
-- ────────────────────────────────────────────────────────────
-- 場所カテゴリの「レジャー」(local_activity) と語彙・アイコンを揃える。
-- 元 seed migration (20260515000002) も同時に書き換え済み。ここでは:
--  1. 関数本体を再 create or replace（既存 linked DB の関数定義を新値に更新）
--  2. 既存 trips にだけ存在する「エンタメ」行を 1 回だけ rename（rename rule
--     なのでバックフィルというより整合修正。重複適用しても no-op）

create or replace function public.seed_default_expense_categories(_trip_id text)
returns void
language plpgsql
security definer
set search_path = public
as $body$
begin
  insert into expense_categories (trip_id, name, color, icon, sort_order)
  values
    (_trip_id, '渡航',     '#3b82f6', 'flight',         1),
    (_trip_id, '現地移動', '#06b6d4', 'tram',           2),
    (_trip_id, '飲食',     '#f97316', 'restaurant',     3),
    (_trip_id, '衣服',     '#a855f7', 'checkroom',      4),
    (_trip_id, 'レジャー', '#ec4899', 'local_activity', 5),
    (_trip_id, '土産',     '#ef4444', 'redeem',         6),
    (_trip_id, '宿泊',     '#6366f1', 'hotel',          7),
    (_trip_id, '通信',     '#6b7280', 'wifi',           8),
    (_trip_id, '医療',     '#10b981', 'local_hospital', 9),
    (_trip_id, 'カジノ',   '#f59e0b', 'casino',         10),
    (_trip_id, 'その他',   '#71717a', 'category',       11);
end;
$body$;

update expense_categories
   set name = 'レジャー', icon = 'local_activity'
 where name = 'エンタメ' and icon = 'celebration';
