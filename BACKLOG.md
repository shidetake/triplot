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

### 15. Google カレンダーエクスポートの本番公開（OAuth 確認申請）
機能自体（`CalendarExportDialog`）は実装済みで動作確認済み。OAuth 同意画面が
Google の「テスト中」状態のままで、今はテストユーザー登録（Cloud Console、上限100人）で
しのいでいる。一般ユーザーに使わせるには確認申請が必要:
- プライバシーポリシーページの作成（`triplot.app/privacy` 等、未作成）
- Search Console でのドメイン所有権確認
- 要求スコープ（`auth/calendar` フルアクセス）を絞れないか検討 — 審査の重さに直結
- 上記を揃えて Google に確認申請を提出（レビューに数日〜数週間）
