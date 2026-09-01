-- 抽出の累計通数。「1通あたりいくらか」を正しく出すために要る。
--
-- ■ なぜ要るか
-- 管理ページは単価を「累計使用額 ÷ 抽出できたメール数」で出していたが、
-- 分子は AI Gateway の**累計**（開設以来）なのに、分母は**今 inbound_emails に
-- 残っている行**を数えていた。分母だけが「今あるもの」なので対応していない。
--
-- 受信箱を空にすると分母がリセットされ、単価が跳ね上がる（実測: 23通しか
-- 残っていない時に $14.721 ÷ 23 = $0.64。実際は1通1〜2セント）。90日の自動削除
-- でも分母だけが減るので、放っておいても徐々に膨らむ。
--
-- ■ どう直すか
-- 分子が累計なので分母も累計にする。行が消えても減らない場所に通数を持つ。
-- 数え始めた時点の使用額を基準として一緒に持つので、過去の不明な通数を
-- 推定しなくても**最初の1通目から正しい平均**が出る。
--
--   単価 = (今の累計使用額 - total_used_at_start) / extracted_since
--
-- ■ 増やし方
-- トリガで増やす。アプリ側の往復を増やさないため（抽出は既に UPDATE を
-- 投げているので、その中で完結する）。extracted_at が null から値になった
-- 瞬間だけ数える＝再抽出で二重に数えない。
create table public.ai_usage_baseline (
  id boolean primary key default true check (id),
  total_used_at_start numeric not null default 0,
  extracted_since bigint not null default 0,
  started_at timestamptz not null default now()
);

-- サービスロール（サーバー側）と管理ページだけが触る。RLS を有効にして
-- ポリシーを1つも置かない＝一般ユーザからは読めも書けもしない。
alter table public.ai_usage_baseline enable row level security;

insert into public.ai_usage_baseline (id) values (true);

create or replace function public.count_extraction()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.ai_usage_baseline
  set extracted_since = extracted_since + 1
  where id;
  return null;
end;
$$;

create trigger inbound_emails_count_extraction
  after update of extracted_at on public.inbound_emails
  for each row
  when (old.extracted_at is null and new.extracted_at is not null)
  execute function public.count_extraction();
