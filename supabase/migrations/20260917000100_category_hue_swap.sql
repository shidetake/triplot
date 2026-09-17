-- 既定カテゴリの色相を入れ替える: 医療を赤(20°)、土産を緑(150°)。
-- 色は**色相だけ**が使われる（明度・彩度は colorRoles の役割ラダーが決める）ので、
-- 入れ替えても読みやすさは変わらない。色相環の配置（最小 30° 間隔）もそのまま。
create or replace function public.seed_default_expense_categories(_trip_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- 色は**色相だけ**が使われる（明度・彩度は colorRoles の役割ラダーが決める）。
  -- そのため色相環に均等に配ること。いまは最小 30° 間隔。
  -- 未分類だけ無彩色（「分類していない」を色で主張しない。ラダーは無彩色を
  -- 検出して中立グレーで描く）。
  insert into expense_categories (trip_id, name, color, icon, sort_order, key)
  values
    (_trip_id, '渡航',     '#398ad6', 'flight',         1,  'flight'),
    (_trip_id, '現地移動', '#0096af', 'tram',           2,  'local_transit'),
    (_trip_id, '飲食',     '#c7692c', 'restaurant',     3,  'dining'),
    (_trip_id, '衣服',     '#a569bf', 'checkroom',      4,  'clothing'),
    (_trip_id, 'レジャー', '#c06099', 'local_activity', 5,  'leisure'),
    (_trip_id, '土産',     '#399d57', 'redeem',         6,  'souvenir'),
    (_trip_id, '宿泊',     '#7f78d6', 'hotel',          7,  'accommodation'),
    (_trip_id, '通信',     '#009b8f', 'wifi',           8,  'communication'),
    (_trip_id, '医療',     '#cd5f62', 'local_hospital', 9,  'medical'),
    (_trip_id, 'カジノ',   '#ae7c00', 'casino',         10, 'casino'),
    (_trip_id, 'その他',   '#848f02', 'category',       11, 'other'),
    -- 未分類 = 「分類していない」既定値（その他 = 「どれにも当てはまらないと
    -- 判断した」とは別物）。無彩色。
    (_trip_id, '未分類',   '#808080', 'label_off',      12, 'uncategorized');
end;
$$;
