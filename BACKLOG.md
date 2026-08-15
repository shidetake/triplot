# triplot 残件

このファイルは機能残件の覚え書き。完了したら該当行を消す（`[x]` のまま残さない）。

## 残件

### 9. Apple ログイン: private relay 経由の新規アカウント作成が未検証
Apple ログイン自体（コード側・Apple Developer 側・Supabase Dashboard 設定、実 Apple ID での
ログイン確認）は完了済み（同一メールの既存 Google アカウントに自動で identity が統合される
＝Supabase Auth の標準挙動。表示名・頭文字アバターは既存アカウントの値がそのまま出る）。
- [ ] private relay（メール非公開）での新規アカウント作成パスだけ未検証（実メールでログイン
      済みのため別 Apple ID が無いと再現できない。急ぎではない）

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

### 16. モバイル: @gorhom/bottom-sheet の完全撤去
旅行編集・カテゴリ管理・エクスポート・予定/費用フォーム・受信箱・設定等は
react-native-screens の native formSheet に移行済み。場所タブ（地図の文脈を
残す必要があるフォーム類）も同じ native の ScreenStack/ScreenStackItem に
移行済み。残っているのは TODO タブの優先度（高/中/低）選択シート1箇所だけ
（`apps/mobile/src/components/form-sheet.tsx` 使用中。ActionSheetIOS がアイコン
付き行を出せないための代替）。
- [ ] タブ画面の中に native の ScreenStack を入れ子にする移行は、タブバー/
      戻るジェスチャーへの影響を実機で検証してからにしたい（他の formSheet 化と
      違い、タブ画面に低レベル部品を入れるのは前例が無いため）。移行できたら
      `@gorhom/bottom-sheet` を依存関係からも削除し `BottomSheetModalProvider`
      （`apps/mobile/src/app/_layout.tsx`）も外す。
