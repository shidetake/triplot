-- 確定ステータスの色を slate-600 に変更（メンバー色 8 種と被らないように）。
-- 20260517000007 の seed 定義は同時に書き換え済み。ここは linked DB の
-- 関数定義に反映させるための再 create or replace。データの UPDATE は含めない
-- （既存 trip の '確定' 行は古い色のまま。新規 trip だけ slate になる）。

create or replace function public.seed_default_place_statuses(_trip_id text)
returns void
language plpgsql
security definer
set search_path = public
as $body$
begin
  insert into place_statuses (trip_id, name, color, sort_order, tentative)
  values
    (_trip_id, '候補', '#f59e0b', 1, true),
    (_trip_id, '確定', '#475569', 2, false);
end;
$body$;
