# triplot 残件 / 優先順位

このファイルは機能残件と優先順位の覚え書き。
完了したら該当行を消す（`[x]` のまま残さない）。気が変わったら順番を入れ替える。

## 優先順位の方針

「序盤に友達には頼まない（形になってから頼む）」前提。
共有機能の前に、まず自分で使って嬉しい機能を優先する。
データモデル（`trip_members` の guest 種別、匿名認証、`create_trip` の DEFINER パターン）は既にゲスト前提なので、共有を後付けしても構造的な書き直しは不要。

## 残件

### 7. 費用・予定の自動取り込み（メール転送）
ユーザが `receipts+<token>@triplot.app` にレシート/予約確認メールを転送 → LLM 抽出 →
どの旅行か自動割り当て → 旅行画面で確定。費用・予定（フライト=transit・宿泊=終日・
予約=timed）の両方に対応済み。後からマージ・自動リトライ（Cloudflare 毎分 reconcile＋
Retry-After）・over_quota 翌月再抽出まで実装。設計は `docs/design/import-flow.md` 参照。
- [ ] 候補ホスト昇格ビュー → 下の「Admin 管理ページ」
- [ ] link enrichment の自動 fetch（未知ホストを人ゲート無しで取得・SSRF/サイズ制限で限定）

### 9. Apple ログイン追加
コード側・Apple Developer 側の設定（App ID `app.triplot`・Services ID `app.triplot.web`・
Sign in with Apple 用 Key）は完了。Supabase Dashboard の Auth → Providers → Apple に
Client IDs（`app.triplot.web`）・Secret Key（JWT）を設定済み。残りは:
- [ ] 実 Apple ID でログイン確認（表示名・頭文字アバター・private relay メール）

### 10. Admin 管理ページ
最初の用途 = link enrichment の**候補ホスト昇格ビュー**（`receipt_link_candidates` を出現回数順で
見て、本物のレシート基盤を `RECEIPT_LINK_HOSTS`〔コード定数〕に昇格＝PR ゲート）。

### 11. BYOK ランタイム（LLM をユーザ自身のキーで）
長期の既定。今は Vercel AI Gateway（loss-leader）。実装時は新規に作る。

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


## セキュリティ系（機能とは別軸、思い出した時にやる）

- [ ] Supabase Personal Access Token: 過去に漏れた古い token があれば revoke（2026-05-15 に triplot-cli の PAT を `.env.local` に追加。同時に古いものを revoke できていれば消して良い）
- [ ] Google OAuth Client Secret rotate
- [ ] Maps API キーの HTTP referrer 制限確認
- [ ] Apple client_secret（JWT）のローテーション: 2026-07-04 に Key ID `7A88Z66JCG` で発行、
      有効期限 **2026-12-31**。失効前に同じ Key（.p8）から JWT を再生成し Supabase Dashboard
      （Auth → Providers → Apple → Secret Key）に貼り直す

## 現在着手中

直近: #7 予定（events）の自動取り込み、完了。
