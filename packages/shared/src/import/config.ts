// メール取り込みの公開設定（表示にも使う値）。サーバ専用の設定（抽出モデル等）は
// apps/web/lib/import/importConfig.ts にある。

// per-user の月間抽出上限（コスト保護）。超過分は抽出せず over_quota で保存のみ。
// 上限引き上げは将来の課金で行う。受信箱の「今月の取り込み X / cap 件」表示にも使う。
export const MONTHLY_EMAIL_CAP = 100;

// 抽出エラーコード（inbound_emails.extract_error）: 本文なし＝再試行しない。
// 受信箱のエラー行の文言分岐（本文なし/再試行あり/再試行なし）にも使う。
export const EXTRACT_ERROR_NO_CONTENT = "no_content";
