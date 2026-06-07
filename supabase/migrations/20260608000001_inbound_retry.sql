-- ────────────────────────────────────────────────────────────
-- 抽出失敗の自動リトライ（バックオフ付き）
-- ────────────────────────────────────────────────────────────
-- Vercel AI Gateway の無料枠レート制限などで一時的に失敗した抽出を、時間を置いて
-- 自動で再試行する。手動ボタンは置かない（失敗直後に押すと再びレート制限に当たる
-- ため）。受信箱を開いた時の after() ＋ 日次 cron がトリガ。
--
-- status は 'error' のまま。リトライ対象かは next_retry_at の有無で区別する
-- （レート制限系のみセット。パース不能等の恒久失敗は null で再試行しない）。
-- retry_count で打ち切りとバックオフ間隔を決める。

alter table inbound_emails
  add column retry_count int not null default 0,
  add column next_retry_at timestamptz;

-- 期限の来たリトライ対象を引くための部分インデックス。
create index inbound_emails_retry_idx
  on inbound_emails (next_retry_at)
  where status = 'error' and next_retry_at is not null;
