// 費用インポートの運用設定（サーバ側バックグラウンド抽出）。

// per-user の月間抽出上限（コスト保護）。超過分は抽出せず over_quota で保存のみ。
// 上限引き上げは将来の課金で行う。
export const MONTHLY_EMAIL_CAP = 100;

// 抽出に使うモデル（Vercel AI Gateway 経由の "provider/model" 文字列）。
// 提供者持ち（運用初期は Gateway の無料クレジット内でほぼ無料）。
export const EXTRACT_MODEL = "google/gemini-2.5-flash";
