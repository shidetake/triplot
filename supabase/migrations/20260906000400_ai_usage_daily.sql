-- 抽出の日別カウンタ。管理ページの「LLM の使用量」の推移に使う。
--
-- ■ なぜ要るか
-- 推移は inbound_emails.extracted_at を数えて出していたが、**受信箱の行が
-- 消えると履歴ごと消える**。90日の自動削除でも、テスト用に受信箱を空にする
-- 運用（npm run test:seed-emails）でも起きる。実測: 累計331通を抽出している
-- のに DB に残っていたのは108通だけで、グラフは「今日しか使っていない」形に
-- なっていた。
--
-- ai_usage_baseline が累計を「行が消えても減らない場所」に持っているのと
-- 同じ考え方を、日別に広げる。
--
-- ■ なぜ通数だけで、金額を持たないか
-- AI Gateway は累計額しか返さない（1回の抽出にいくらかかったかを返す API が
-- 無い）ので、日ごとの正確な金額は原理的に記録できない。コストは従来どおり
-- 「通数 × 実績単価」の概算で出す。単価は全期間の平均なので、日ごとの実際の
-- ばらつきは反映されない——これは表示側で概算だと明示している。
create table public.ai_usage_daily (
  -- 抽出した日（UTC）。運用者が見るのはローカル日付だが、記録は UTC で持つ
  -- （集計側で寄せる。DB がタイムゾーンを持たないと後から直せない）。
  day date primary key,
  extracted_count bigint not null default 0
);

-- ai_usage_baseline と同じ扱い。サービスロールと管理ページだけが触るので、
-- RLS を有効にしてポリシーは置かない。
alter table public.ai_usage_daily enable row level security;

-- 既存のトリガ関数に日別の記録を足す（トリガを増やさない＝抽出1件に対する
-- 書き込みの回数を増やさない）。
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

  insert into public.ai_usage_daily (day, extracted_count)
  values ((new.extracted_at at time zone 'utc')::date, 1)
  on conflict (day)
  do update set extracted_count = ai_usage_daily.extracted_count + 1;

  return null;
end;
$$;
