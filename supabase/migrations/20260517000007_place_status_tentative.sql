-- ステータスに「未確定（tentative）」フラグを持たせる。
--
-- 用途: 地図ピンの見せ方を status の意味で変える。tentative なステータス
-- （行くか微妙＝候補）のピンは半透明、確定はくっきり。名前文字列で判定すると
-- 脆いので、place_statuses に明示的な真偽列を持たせる（列挙はテーブルに
-- 正しく持たせる方針）。seed は 候補=true / 確定=false。
--
-- 開発中につき backfill は書かない（新規 trip は seed で正しく入る。既存の
-- テスト trip を直したい場合は trip を作り直す）。

alter table place_statuses
  add column tentative boolean not null default false;

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
    (_trip_id, '確定', '#10b981', 2, false);
end;
$body$;
