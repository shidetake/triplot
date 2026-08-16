# triplot 残件

このファイルは機能残件の覚え書き。完了したら該当行を消す（`[x]` のまま残さない）。

## 残件

### 12. iOS アプリ公開
実装（Expo/React Native、`apps/mobile`）は完了済み。残っているのは
App Store 公開（TestFlight から本番リリースへ）。

### 14. LP 本体（コピー/動画/スクショ）
骨組み（ルート・共有ヘッダー・URL/IA）は実装済み。LP のコンテンツ制作が残。

### 15. OAuth 同意画面のロゴ設定（ブランド確認）
カレンダーエクスポートの本番公開は完了（2026-07-14。スコープを非 sensitive の
`calendar.app.created` に絞り、`/privacy` 作成・ドメイン確認のうえ公開切替。
一般アカウントでのエクスポート動作確認済み）。残っているのはロゴのみ:
アップロードするとブランド確認（審査・数日）が発動するため未設定にしてある。
同意画面にロゴを出したくなったら設定して審査を通す。
（iOS のカレンダーエクスポートは 2026-07-14 実装済み）


### 17. 招待リンクの Universal Links を有効にする
アプリ側の受け口（`apps/mobile/src/app/join/[token].tsx`）と web 側の
apple-app-site-association の配信は実装済みで、残りは Apple Developer Portal の
設定と1行の復帰だけ。

1. Portal → Identifiers → `app.triplot.mobile` に **Associated Domains** を追加
2. Profiles → App Store 配布用プロファイルを Edit → Generate → Download
3. `npx eas-cli credentials`（Apple ログインは「いいえ」でよい）でそのプロファイルに差し替え
4. `apps/mobile/app.config.ts` の ios にコメントで残してある
   `associatedDomains` の1行を戻してビルド

宣言だけ先に戻すと署名段階でビルドが落ちるので、1〜3 を済ませてから 4 を行う。
それまで招待リンクは web の参加ページが開く（アプリ内の参加画面自体は
`triplot://join/<token>` で確認できる）。
