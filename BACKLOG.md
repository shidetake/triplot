# triplot 残件

このファイルは機能残件の覚え書き。完了したら該当行を消す（`[x]` のまま残さない）。

## 残件

### 9. Apple ログイン: private relay 経由の新規アカウント作成が未検証
Apple ログイン自体（コード側・Apple Developer 側・Supabase Dashboard 設定、実 Apple ID での
ログイン確認）は完了済み（同一メールの既存 Google アカウントに自動で identity が統合される
＝Supabase Auth の標準挙動。表示名・頭文字アバターは既存アカウントの値がそのまま出る）。
- [ ] private relay（メール非公開）での新規アカウント作成パスだけ未検証（実メールでログイン
      済みのため別 Apple ID が無いと再現できない。急ぎではない）

### 12. iOS アプリ化
Web アプリを iOS アプリとして出す。方式未定（PWA ラップ / Capacitor / React Native / ネイティブ）。
Apple ログイン（#9）が前提になる。デザインルールやコピーもアプリ前提で見直す箇所が出るかも。

### 14. LP 本体（コピー/動画/スクショ）
骨組み（ルート・共有ヘッダー・URL/IA）は実装済み。LP のコンテンツ制作が残。

### 15. Google カレンダーエクスポートの本番公開（OAuth 同意画面の公開切替）
機能（`CalendarExportDialog`）は実装済み。スコープは `calendar.app.created`
（triplot が作ったカレンダーのみ作成・書き込み。既存カレンダー選択は廃止）に
絞り済み — 非 sensitive のため sensitive スコープ審査（正当性説明＋デモ動画）は
不要になる想定。プライバシーポリシー（`/privacy`）も作成済み。残タスク:
- GCP Console のスコープ設定を `calendar.app.created` に差し替え、sensitive
  バッジが付かないことを確認（付いたら分類が想定と違う＝審査前提で再計画）
- Search Console でのドメイン所有権確認（Cloudflare に TXT レコード追加）
- OAuth 同意画面に homepage（`https://triplot.app`）とプライバシーポリシー
  （`https://triplot.app/privacy`）の URL を設定し、「テスト中」→「本番」へ公開切替
- 非 sensitive のみならブランド確認（アプリ名/ロゴ、数日）だけで完了の想定
