-- ────────────────────────────────────────────────────────────
-- 後からマージ：別メールを既存の未確定下書きに合体する
-- ────────────────────────────────────────────────────────────
-- 1通ずつ処理するため、確定/更新メールが後から来る。referenceId 等で既存の未確定
-- 下書きと突き合わせ、同一取引なら合体（合体先 = ターゲット、来たメールは merged）。

alter table inbound_emails drop constraint inbound_emails_status_check;
alter table inbound_emails
  add constraint inbound_emails_status_check
  check (status in (
    'pending', 'extracted', 'over_quota', 'error',
    'confirmed', 'dismissed', 'merged'
  ));

-- merged のとき、合体先の下書きを指す。
alter table inbound_emails
  add column merged_into uuid references inbound_emails(id) on delete set null;
