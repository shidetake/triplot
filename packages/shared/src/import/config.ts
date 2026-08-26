// メール取り込みの公開設定（表示にも使う値）。サーバ専用の設定（抽出モデル等）は
// apps/web/lib/import/importConfig.ts にある。

// per-user の月間抽出上限（コスト保護）。超過分は抽出せず over_quota で保存のみ。
// 受信箱の「今月の取り込み X / cap 件」表示にも使う。
//
// これは docs/design/billing.md の「プランの上限」にあたる値。プラン（無料/有料）は
// まだ実装していないので、当面この定数が全員のプランの上限になる。
// **個別のユーザの枠を増やすときはこの値を動かさない** — users の
// monthly_email_cap_override（個別上書き）に入れる。実効上限は
// effectiveEmailCap() が max で決める。
export const MONTHLY_EMAIL_CAP = 100;

// 抽出エラーコード（inbound_emails.extract_error）: 本文なし＝再試行しない。
// 受信箱のエラー行の文言分岐（本文なし/再試行あり/再試行なし）にも使う。
export const EXTRACT_ERROR_NO_CONTENT = "no_content";
