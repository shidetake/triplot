-- ────────────────────────────────────────────────────────────
-- 受信メールのバックグラウンド抽出結果（費用インポート）
-- ────────────────────────────────────────────────────────────
-- 方針（合意）: 受信時にサーバ側で Vercel AI Gateway を使って抽出し、下書きを
-- 先回り生成する。コスト保護に per-user の月間抽出上限を設ける（超過分は
-- over_quota で保存のみ・抽出しない。上限引き上げは将来の課金で）。

alter table inbound_emails
  add column status text not null default 'pending'
    check (status in ('pending', 'extracted', 'over_quota', 'error')),
  add column extracted jsonb,        -- 抽出した Receipt
  add column extracted_at timestamptz,
  add column extract_error text;

-- 月次カウント（user_id × received_at）用。
create index inbound_emails_user_received_idx
  on inbound_emails (user_id, received_at);
