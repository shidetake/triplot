// メール取り込みの公開設定（表示にも使う値）。サーバ専用の設定（抽出モデル等）は
// apps/web/lib/import/importConfig.ts にある。

// per-user の月間抽出上限（コスト保護）。超過分は抽出せず over_quota で保存のみ。
// 受信箱の「今月の取り込み X / cap 件」表示にも使う。
//
// これは docs/design/billing.md の「プランの上限」にあたる値。個別上書き
// （ユーザごとの優遇）はまだ実装していないので、当面この1つの定数が全員の
// 実効上限になる。開発中は実利用が開発者だけなので、テストが止まらない
// 値にしておく（実際のコストの歯止めは AI Gateway のクレジット側で効く）。
export const MONTHLY_EMAIL_CAP = 500;

// 抽出エラーコード（inbound_emails.extract_error）: 本文なし＝再試行しない。
// 受信箱のエラー行の文言分岐（本文なし/再試行あり/再試行なし）にも使う。
export const EXTRACT_ERROR_NO_CONTENT = "no_content";
