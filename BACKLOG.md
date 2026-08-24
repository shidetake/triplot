# triplot 残件

このファイルは機能残件の覚え書き。完了したら該当行を消す（`[x]` のまま残さない）。

## 残件

### 12. iOS アプリ公開
実装（Expo/React Native、`apps/mobile`）は完了済み。残っているのは
App Store 公開（TestFlight から本番リリースへ）。

提出前にやること:

- [ ] **AI Gateway のクレジットを買う**。無料枠は月あたりヘビーユーザー2人分
  程度しかなく、公開して人が増えると取り込みが止まる。枠と上限の詳細は
  [docs/design/import-flow.md](docs/design/import-flow.md) の
  「AI Gateway の無料枠の制限」。
- [ ] **バージョンを 1.0.0 にする**。`apps/mobile/app.config.ts` の `version`
  （ビルド番号は `eas.json` の `autoIncrement` が自動で上げるので触らない）。
  **提出用ビルドの直前に上げる** — TestFlight の確認ビルドを 1.0.0 で
  埋めてしまわないため。手順は [docs/versioning.md](docs/versioning.md)。
- [ ] **審査員用のデモアカウントを審査メモに書く**。入口が OAuth（Google /
  Apple）だけなので、審査員がサインインできないと即リジェクトされる。
  App Store Connect のバージョン情報 → 「App Review Information」に
  メール／パスワードを記載する。開発用ログインは `next dev` と EAS の
  preview ビルドにしか入っていない（本番ビルドにはボタン自体が無い）ので、
  **審査用のアカウントを別途用意して渡す**必要がある。
- [ ] **migration をスカッシュする**。「本番運用フェーズに入った」と宣言する
  タイミングと同じ。以降は backfill を真面目に書く運用に切り替わる
  （AGENTS.md「Migration ポリシー（開発期間中）」）。スキーマが固まって
  からでよい。

### 14. LP 本体（コピー/動画/スクショ）
骨組み（ルート・共有ヘッダー・URL/IA）は実装済み。LP のコンテンツ制作が残。

### 15. OAuth 同意画面のロゴ設定（ブランド確認）
カレンダーエクスポートの本番公開は完了（2026-07-14。スコープを非 sensitive の
`calendar.app.created` に絞り、`/privacy` 作成・ドメイン確認のうえ公開切替。
一般アカウントでのエクスポート動作確認済み）。残っているのはロゴのみ:
アップロードするとブランド確認（審査・数日）が発動するため未設定にしてある。
同意画面にロゴを出したくなったら設定して審査を通す。
（iOS のカレンダーエクスポートは 2026-07-14 実装済み）

### 17. iOS のピッカー2つを react-native-screens の formSheet に寄せる
通貨選択とコピー元選択だけ RN core の `<Modal presentationStyle="pageSheet">`
を使っていて、他のシート（react-native-screens の formSheet）と API が違う。
この API は detent を持てないので**中身が短くても高さが縮まない**（コピー元が
1件でも画面いっぱいに出る）。グラバー・見出しの見た目は `PageSheet`
（`components/page-sheet.tsx`）で揃えてあるが、高さだけは揃えられない。

理由は「formSheet の中にさらに `ScreenStack` を入れ子にすると元の画面と
二重露光のように重なる」という実機で確認した不具合。ただし**これは当時この
リポジトリで試して出した結論で、上流に既知の issue として報告されているかは
未確認**。使い方の問題で書き方次第では動く可能性も残っている。

- 現状 `react-native-screens` 4.26.2（`~4.26.0` 指定）。最新の安定版 4.27.0
  （2026-08-07）のリリースノートに該当する修正は無い（formSheet 関連は
  Android の1件のみ）。上げても変わらない。
- `5.0.0-alpha` で Stack v5 が進行中なので、安定したら試し直す価値がある。
- 上流に issue を出して確認するのも手。

寄せられれば ui-guidelines の「RN のシート」の例外が1つ消える。
