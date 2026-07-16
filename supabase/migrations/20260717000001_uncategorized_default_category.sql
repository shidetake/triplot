-- デフォルトカテゴリに「未分類」を追加する。
--
-- 費用を精算したい人が必ずカテゴリ分けしたいとは限らない。従来はフォームに
-- 常に実カテゴリ（前回使ったもの等）が選択済みで「選ばざるを得ない」見え方に
-- なっていたため、「未分類」を既定の選択にする（フォームの初期値はアプリ側）。
--
-- 設計判断: category_id の nullable 化ではなく「未分類」行を置く（DWH の
-- unknown 行と同じ定石）。NOT NULL を維持でき、将来のカテゴリ別集計・CSV で
-- null 分岐が不要。デフォルトカテゴリの仕組み（key による i18n 名・改名/削除
-- 不可）にそのまま乗るので特例コードもない。「NULL 相当を『その他』で代用」
-- 案は、明示的にその他を選んだ費用と区別できなくなるため採らない。

-- 既存の旅行は 12 個目の「未分類」を持たない。開発中データは全てテスト用
-- なので、真っ新な状態から動く設計にする（migration ポリシー）。
truncate table trips cascade;

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
    (_trip_id, 'その他',   '#71717a', 'category',       11, 'other'),
    -- 未分類 = 「分類していない」既定値（その他 = 「どれにも当てはまらないと
    -- 判断した」とは別物）。控えめな薄グレー。
    (_trip_id, '未分類',   '#a1a1aa', 'label_off',      12, 'uncategorized');
end;
$body$;
