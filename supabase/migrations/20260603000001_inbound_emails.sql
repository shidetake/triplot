-- ────────────────────────────────────────────────────────────
-- inbound_emails: 転送されてきた受信メールの生キャプチャ（費用インポートの素材）
-- ────────────────────────────────────────────────────────────
-- メール転送方式（TripIt 風）の取り込みパイプで、Cloudflare Email Worker →
-- /api/inbound-email 経由で届いた生メール(MIME)をそのまま貯める。
-- M2 ではここに溜まった実レシートをサンプル/fixture 化してパーサを開発する。
-- 後段（M3）でここから費用の下書きを生成する staging の入口にもなる。
--
-- RLS: ポリシーを一切作らない＝authenticated/anon からは触れない。書き込みは
-- サーバの service_role クライアント（RLS バイパス）からのみ。生メールは個人情報を
-- 含みうるので、trip メンバーであっても通常経路では読めないようにロックする。

create table inbound_emails (
  id          uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  sender      text not null,        -- 封筒 From（転送元＝メンバー特定に使う予定）
  recipient   text not null,        -- 宛先（receipts+<tripId>@… のタグで旅行特定予定）
  subject     text,
  message_id  text,                 -- 重複検知用（将来 unique 化の余地）
  raw         text not null,        -- 生 MIME 全文
  size        integer
);

create index inbound_emails_received_idx on inbound_emails (received_at desc);

alter table inbound_emails enable row level security;
-- ポリシー無し＝service_role 専用。意図的にロックダウン。
