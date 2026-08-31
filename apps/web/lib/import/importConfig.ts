// 費用インポートの運用設定（サーバ側バックグラウンド抽出）。
// 表示にも使う値（月間上限）は shared に置き、web/RN で共有する。

export { MONTHLY_EMAIL_CAP } from "@triplot/shared/import/config";

// 抽出に使うモデル（Vercel AI Gateway 経由の "provider/model" 文字列）。
// 提供者持ち（運用初期は Gateway の無料クレジット内でほぼ無料）。
export const EXTRACT_MODEL = "google/gemini-2.5-flash";

// 関数の寿命。**プランの上限いっぱい**に取る（Hobby は 300 秒。超えるとデプロイが
// `invalid_max_duration` で失敗する）。長いほど1回で多く流せる。
//
// cron のルートの `export const maxDuration` と同じ値。Next は segment config を
// 静的に読むので import した定数を書けず、二重に持つしかない（functionDuration.test.ts
// が突き合わせる）。
export const FUNCTION_MAX_SECONDS = 300;
