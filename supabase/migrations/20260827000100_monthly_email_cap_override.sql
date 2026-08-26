-- メール取り込みの月間上限の「個別上書き」（docs/design/billing.md）。
--
-- 実効上限 = max(プランの上限, 個別上書き)。プランはまだ実装していないので、
-- 当面「プランの上限」はアプリ側の定数（MONTHLY_EMAIL_CAP）が担う。
--
-- 書き換えるのは手動の運用操作だけ。UI からは触らせない（優遇・個別対応の値で
-- あって、ユーザが選ぶ設定ではない）。未設定（NULL）は「上書き無し」。
alter table public.users
  add column monthly_email_cap_override integer
    check (monthly_email_cap_override is null or monthly_email_cap_override >= 0);

comment on column public.users.monthly_email_cap_override is
  'メール取り込みの月間上限の個別上書き。実効上限 = max(プランの上限, この値)。NULL = 上書き無し。手動運用のみ。';
