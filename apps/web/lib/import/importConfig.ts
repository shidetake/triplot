// 費用インポートの運用設定（サーバ側バックグラウンド抽出）。
// 表示にも使う値（月間上限）は shared に置き、web/RN で共有する。

export { MONTHLY_EMAIL_CAP } from "@triplot/shared/import/config";

// 抽出に使うモデル（Vercel AI Gateway 経由の "provider/model" 文字列）。
// 提供者持ち（運用初期は Gateway の無料クレジット内でほぼ無料）。
export const EXTRACT_MODEL = "google/gemini-2.5-flash";
