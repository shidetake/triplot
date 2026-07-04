-- ────────────────────────────────────────────────────────────
-- 候補ホストに「配信解除リンクの疑い」フラグを追加
-- ────────────────────────────────────────────────────────────
-- 第2パスの enrichment fetch は detailUrl が unsubscribe/opt-out 等のキーワードを
-- 含む場合はそもそも fetch しない（予防。apps/web/lib/import/links.ts の
-- isLikelyUnsubscribeUrl）。それでも「LLM がそう報告した」事実は admin 管理ページで
-- 見えるようにし、そのホストの扱いを判断する材料にする。

alter table receipt_link_candidates
  add column skipped_unsubscribe boolean not null default false;

create or replace function public.record_receipt_link_candidate(
  p_host                text,
  p_sample_url          text default null,
  p_skipped_unsubscribe boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into receipt_link_candidates (host, sample_url, skipped_unsubscribe)
  values (p_host, p_sample_url, p_skipped_unsubscribe)
  on conflict (host) do update
    set seen_count = receipt_link_candidates.seen_count + 1,
        last_seen  = now(),
        sample_url = coalesce(receipt_link_candidates.sample_url, excluded.sample_url),
        -- 一度でも配信解除っぽいと報告されたら、以後もフラグを維持する（sticky）。
        skipped_unsubscribe =
          receipt_link_candidates.skipped_unsubscribe or excluded.skipped_unsubscribe;
end;
$$;

-- パラメータが増えても同一関数（引数追加＋デフォルト値のみ）なので念のため再度縛る。
revoke execute on function public.record_receipt_link_candidate(text, text, boolean)
  from public, anon, authenticated;
