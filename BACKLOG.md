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


## セキュリティ系（機能とは別軸、思い出した時にやる）

- [ ] Supabase Personal Access Token: 過去に漏れた古い token があれば revoke（2026-05-15 に triplot-cli の PAT を `.env.local` に追加。同時に古いものを revoke できていれば消して良い）
- [ ] Google OAuth Client Secret rotate
- [ ] Maps API キーの HTTP referrer 制限確認

## 設計メモ（低優先・思い出した時にやる）

- [ ] タイムゾーン: 通常予定/費用の実IANA文字列カラムは冗長。`events.start_tz`/`end_tz`、`expenses.tz` は
      通常予定・費用では「旅程上どの区間にいるか」のラベルとしてしか使われておらず
      （`resolveExpenseTz`、`packages/shared/src/schedule.ts`）、理論上は区間番号で足りる。実IANA文字列が
      本質的に要るのは **transit イベントの出発/到着 TZ のみ**（旅程全体の offset 計算の唯一の真実源。
      `buildTripTzTimeline` がここを起点にチェーンする）。複数都市またぎの費用ソート（`occurred_at`）も
      Google カレンダーエクスポート（`gcalEvent.ts`）も、transit 側の実 TZ から都度導出すれば通常予定/費用に
      実IANA文字列を冗長保存しなくて済む。ただし `events.start_tz` を区間番号化する migration コストに対し、
      現状UX（フルピッカーを transit 日だけに絞った）で実用上の問題は解消済みなので、今すぐ着手する価値はない。

## 現在着手中

直近: 通貨拡張（JPY/USD 固定を撤廃、全 ISO 4217 対応）＋タイムゾーンピッカーを native select に変更、完了。
次の機能着手候補: **#9 Apple ログイン**（iOS 出す前に必須）or **#14 LP 本体**。
