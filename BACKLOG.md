# triplot 残件 / 優先順位

このファイルは機能残件と優先順位の覚え書き。
完了したら該当行を消す or `[x]` に変える。気が変わったら順番を入れ替える。

## 優先順位の方針

「序盤に友達には頼まない（形になってから頼む）」前提。
共有機能の前に、まず自分で使って嬉しい機能を優先する。
データモデル（`trip_members` の guest 種別、匿名認証、`create_trip` の DEFINER パターン）は既にゲスト前提なので、共有を後付けしても構造的な書き直しは不要。

## 残件

### 5. trip の磨き込み（小）— [x] 実装済み
- [x] 費用カテゴリのカスタマイズ UI（デフォルト 11 カテゴリは読み取り専用、カスタムは追加・編集・削除可。`key = NULL` で `name` 直表示）

### 7. 費用の自動取り込み（メール転送）— [x] 実装済み
ユーザが `receipts+<token>@triplot.app` にレシートを転送 → LLM 抽出 → どの旅行か自動割り当て
→ 旅行画面で確定。後からマージ・自動リトライ（Cloudflare 毎分 reconcile＋Retry-After）・
over_quota 翌月再抽出・明細リンク enrichment まで実装。設計は `docs/design/import-flow.md` 参照。
- [ ] 予定（events）の取り込みは未着手（今回は費用に絞った）
- [ ] 候補ホスト昇格ビュー → 下の「Admin 管理ページ」
- [ ] link enrichment の自動 fetch（未知ホストを人ゲート無しで取得・SSRF/サイズ制限で限定）

### 9. Apple ログイン追加
- 現状は **Google OAuth**（Supabase）のみ。
- iOS アプリでは **Sign in with Apple が必須**: App Store Review 4.8 で「他のソーシャルログイン
  （Google 等）を出すなら Apple ログインも提供」が要求される。
- 注意: Apple は**アバター画像を提供しない**（名前・email も初回のみ・private relay の可能性）→
  頭文字フォールバック必須（`docs/ui-guidelines.md` のアバター項参照）。

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

## 設計メモ（低優先・思い出した時にやる）

- [x] タイムゾーン: 通常予定/費用の実IANA文字列カラムの冗長性を解消 — 実装済み（migration
      `20260702000001_event_expense_tz_normalize.sql` → `20260702000002_trip_default_timezone.sql`
      で完全な参照化に発展）。`events`/`expenses` に `tz_disambig_transit_id`/`tz_disambig_side`
      （乗継当日の選択、単純な区間番号ではなく「どの乗継の出発/到着側か」への参照）を追加し、
      非曖昧な日は保存無しで毎回旅程から自動導出（`resolveEventTz`、`packages/shared/src/schedule.ts`）。
      乗継を編集すると紐づく予定/費用の表示TZが自動追従する。通常予定・費用は**常に**「参照 or
      自動導出」のみで実TZ文字列を持つことは無い（`trips.default_timezone` を追加し、旅程に transit
      が1つも無い旅行の唯一の拠り所とした。ユーザーには不可視・変更UI無し、旅行作成時に
      作成者のブラウザTZで一度だけ自動セット。以後は不変）。設計と経緯は `docs/design/timezone.md` 参照。
      `expenses.occurred_at`（発生順ソート用に絶対時刻を書き込み時に焼き込んでいたキャッシュ列）は
      廃止（migration `20260702000005_drop_expense_occurred_at.sql`）。実TZを保存しない設計と矛盾する
      旧設計の名残だった上、乗継を後から作成/編集しても追従しない穴もあった。ソートは表示のたびに
      `resolveEventTz` で解決したTZ + `paid_at` から都度算出する方式に統一（`page.tsx`）。これで
      乗継編集時のカスケードもソート順まで含めて自動追従するようになった。

## 現在着手中

直近: 通貨拡張（JPY/USD 固定を撤廃、全 ISO 4217 対応）＋タイムゾーンピッカーを native select に変更、完了。
次の機能着手候補: **#9 Apple ログイン**（iOS 出す前に必須）or **#14 LP 本体**。
