-- ────────────────────────────────────────────────────────────
-- フィードバックにデバッグ用メタデータを追加
-- ────────────────────────────────────────────────────────────
-- バグ再現のための技術的な診断情報。ユーザーには見せず（フォームは注記1文のみ）、
-- 送信時に自動収集して付加する。個人情報ではなく通常のアクセスログ相当の情報のため
-- 同意 UI は設けない（docs/design/feedback.md 参照）。

alter table feedback
  add column platform text,     -- 送信元クライアント種別（'web' / 将来 'ios' / 'android'）
  add column viewport text,     -- ブラウザの表示領域 "幅x高さ"（例 "1456x780"）
  add column timezone text,     -- ブラウザの実タイムゾーン（IANA名。日時系バグの手がかり）
  add column theme text,        -- 実際に表示されていたテーマ（'light' / 'dark'。system設定の解決後）
  add column app_version text;  -- 送信時にデプロイされていたアプリのバージョン（lib/version.ts の getVersion()）

-- 列レベル権限: 新しい列もユーザーが insert 時に指定してよい（status と違い改変リスクが
-- 無い診断情報のため）。既存の insert grant を列を含めて張り直す。
grant insert (
  user_id, kind, body, path, user_agent, platform, viewport, timezone, theme, app_version
) on feedback to authenticated;
