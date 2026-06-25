-- expense_categories に key カラムを追加。
-- デフォルト 11 カテゴリは安定した英語キーを持ち、UI 側 i18n カタログで翻訳する。
-- カスタムカテゴリは key = NULL のまま name をそのまま表示する。

truncate table trips cascade;

alter table expense_categories
  add column key text;

-- ────────────────────────────────────────────────────────────
-- seed 関数: key を追加してデフォルト値を設定
-- ────────────────────────────────────────────────────────────
create or replace function public.seed_default_expense_categories(_trip_id text)
returns void
language plpgsql
security definer
set search_path = public
as $body$
begin
  insert into expense_categories (trip_id, name, color, icon, sort_order, key)
  values
    (_trip_id, '渡航',     '#3b82f6', 'flight',         1,  'flight'),
    (_trip_id, '現地移動', '#06b6d4', 'tram',           2,  'local_transit'),
    (_trip_id, '飲食',     '#f97316', 'restaurant',     3,  'dining'),
    (_trip_id, '衣服',     '#a855f7', 'checkroom',      4,  'clothing'),
    (_trip_id, 'レジャー', '#ec4899', 'local_activity', 5,  'leisure'),
    (_trip_id, '土産',     '#ef4444', 'redeem',         6,  'souvenir'),
    (_trip_id, '宿泊',     '#6366f1', 'hotel',          7,  'accommodation'),
    (_trip_id, '通信',     '#6b7280', 'wifi',           8,  'communication'),
    (_trip_id, '医療',     '#10b981', 'local_hospital', 9,  'medical'),
    (_trip_id, 'カジノ',   '#f59e0b', 'casino',         10, 'casino'),
    (_trip_id, 'その他',   '#71717a', 'category',       11, 'other');
end;
$body$;
