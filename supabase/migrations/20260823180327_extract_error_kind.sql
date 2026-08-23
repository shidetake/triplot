-- 抽出失敗の「性質」を残す。
--
-- 受信箱は今 next_retry_at の有無だけで「再試行します／できません」を出し分けて
-- いるが、再試行するケースの中身は質が違う:
--
--   rate_limit  混んでいて順番待ちしているだけ。ユーザーから見れば失敗ではなく
--               処理中で、赤い箱に「失敗しました」と出すのは誤報に近い。
--   transient   相手のサーバ側の問題。こちらは本当に失敗していて、時間を置いて
--               再試行するという説明が正しい。
--
-- 表示を分けるには分類結果が要る。extract_error の文字列を UI 側で正規表現に
-- かける手もあるが、それはバックエンドから取り除いたばかりの脆い方法なので
-- 採らない（レート制限とクレジット枯渇がどちらも "free tier" を含む、という
-- 実際に踏んだ問題と同じ形）。分類は process.ts の classifyFailure が既に
-- 持っているので、その結果をそのまま列にする。

alter table public.inbound_emails
  add column extract_error_kind text;

alter table public.inbound_emails
  add constraint inbound_emails_extract_error_kind_check
  check (
    extract_error_kind is null
    or extract_error_kind in ('rate_limit', 'transient', 'permanent', 'unknown')
  );

comment on column public.inbound_emails.extract_error_kind is
  '抽出失敗の性質（classifyFailure の結果）。受信箱の文言と見た目の出し分けに使う。';
