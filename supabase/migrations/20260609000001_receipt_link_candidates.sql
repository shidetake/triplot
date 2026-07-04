-- ────────────────────────────────────────────────────────────
-- リンク enrichment の学習：候補ホストの蓄積
-- ────────────────────────────────────────────────────────────
-- メールは処理後に消すので「保存メールを後で解析」はできない。代わりに抽出の瞬間に
-- LLM が見つけた明細リンク(detailUrl)のうち、まだ許可リスト(RECEIPT_LINK_HOSTS)に
-- 無いホストだけを、ホスト名レベルでここに蓄積する（メール本体・トークン付きURLは残さない）。
-- 人が admin 管理ページ（/admin）で出現回数を見て本物のレシート基盤をコード定数に昇格させる。

create table receipt_link_candidates (
  host       text primary key,
  seen_count int not null default 1,
  sample_url text,                       -- scheme://host/path（クエリ/トークンは含めない）
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);

-- 通常ユーザには非公開（service role の background 抽出だけが書き、admin だけが読む想定）。
alter table receipt_link_candidates enable row level security;

-- ホストを1件記録（同一ホストは出現回数を増やす）。background 抽出から service role で呼ぶ。
create or replace function public.record_receipt_link_candidate(
  p_host       text,
  p_sample_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into receipt_link_candidates (host, sample_url)
  values (p_host, p_sample_url)
  on conflict (host) do update
    set seen_count = receipt_link_candidates.seen_count + 1,
        last_seen  = now(),
        sample_url = coalesce(receipt_link_candidates.sample_url, excluded.sample_url);
end;
$$;

-- 一般ロールからは呼べないようにする（service role のみ）。
revoke execute on function public.record_receipt_link_candidate(text, text)
  from public, anon, authenticated;
