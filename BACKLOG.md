# triplot 残件 / 優先順位

このファイルは MVP の機能残件と優先順位の覚え書き。
完了したら該当行を消す or `[x]` に変える。気が変わったら順番を入れ替える。

## 優先順位の方針

「序盤に友達には頼まない（形になってから頼む）」前提。
共有機能の前に、まず自分で使って嬉しい機能を優先する。
データモデル（`trip_members` の guest 種別、匿名認証、`create_trip` の DEFINER パターン）は既にゲスト前提なので、共有を後付けしても構造的な書き直しは不要。

## 残件

### 1. B: 費用入力 + 割り勘 UI（中）— [x] 実装 / [ ] 手動動作確認
- カテゴリ + per-expense レート対応まで実装済み。残るは手動 UI 確認（金額追加・サマリ更新・private 切替・削除・外貨換算・カテゴリ）

### 2. D: 週ビューカレンダー（中） or  C: 地図ピン（大）
旅行プランの主軸。どちらを先にやるかは着手時に決める。
- D の方が外部 API 依存が少なくて軽い（FullCalendar に events を流し込むだけ）
- C は Google Maps SDK / Places API / HTTP referrer 制限など外部依存が多い
- ただし events.place_id → places.id の参照を活かしたいなら C → D の順がデータ的にはエレガント

### 3. もう一方の C / D
2 と対のもの。

### 4. A: 共有リンク + ゲスト参加（中）
- B/C/D が揃って「形になってから」友達に見せられる
- 既存の trip_invites テーブルとゲスト用 kind は準備済み

### 5. E: trip の磨き込み（小）
- 為替レート編集 UI（trip 詳細から）
- メンバー UI（並び替え、色、表示名変更）
- 脱退（`left_at` セット）

### 6. F: スタイリング（小〜中）
- shadcn/ui 導入を検討
- 形が整ってから

### 7. 費用の自動取り込み（メール転送）— [x] 実装済み
ユーザが `receipts+<token>@triplot.app` にレシートを転送 → LLM 抽出 → どの旅行か自動割り当て
→ 旅行画面で確定。後からマージ・自動リトライ（Cloudflare 毎分 reconcile＋Retry-After）・
over_quota 翌月再抽出・明細リンク enrichment まで実装。設計は `docs/import-flow.md` 参照。
- [ ] 予定（events）の取り込みは未着手（今回は費用に絞った）
- [ ] 候補ホスト昇格ビュー → 下の「10. Admin 管理ページ」
- [ ] link enrichment の自動 fetch（未知ホストを人ゲート無しで取得・SSRF/サイズ制限で限定）

### 8. ヘッダ整理 — [x] 実装済み
ホーム右上を **[受信箱アイコン（Lucide `inbox`）] + [アバターメニュー]** に再構成（`AccountMenu`）。
アバター = Google 写真 or 頭文字、メニュー = email / 設定 / ログアウト。旅行内の ⋯ はそのまま。
- [ ] 他ページ（旅行詳細・設定・取り込み）のヘッダも同じ並びに揃えるかは追って検討。

### 9. ログイン方式（結論: 最低限 Google ＋ Apple）
- 現状は **Google OAuth**（Supabase）。
- iOS アプリでは **Sign in with Apple が必須**: App Store Review 4.8 で「他のソーシャルログイン
  （Google 等）を出すなら Apple ログインも提供」が要求される。Google を残すなら Apple 追加が要る。
- **結論: 最低限のログインは Google ＋ Apple**（Google は web/クロスプラットフォームで継続、Apple は
  iOS 要件）。それ以上（メール+パスワード等）は当面不要。
- 注意: Apple は**アバター画像を提供しない**（名前・email も初回のみ・private relay の可能性）→
  頭文字フォールバック必須（`docs/design-guidelines.md` のアバター項参照）。

### 10. Admin 管理ページ
最初の用途 = link enrichment の**候補ホスト昇格ビュー**（`receipt_link_candidates` を出現回数順で
見て、本物のレシート基盤を `RECEIPT_LINK_HOSTS`〔コード定数〕に昇格＝PR ゲート）。

### 11. BYOK ランタイム（LLM をユーザ自身のキーで）
長期の既定。今は Vercel AI Gateway（loss-leader）。※未接続の足場（設定画面の APIキー入力 UI =
`llm-key-settings` / `llmSettings`）は残骸だったので撤去済み。実装時は新規に作る。

### 12. iOS アプリ化
Web アプリを iOS アプリとして出す。方式未定（PWA ラップ / Capacitor / React Native / ネイティブ）。
Apple ログイン（#9）が前提になる。デザインルールやコピーもアプリ前提で見直す箇所が出るかも。

### 13. ダークモード対応（近いうちに）
Primary / 選択・アクティブは既に `bg-primary` 等のテーマトークンに移行済み（ライト黒・ダーク反転）。
残りの neutral 系（`bg-white` / `text-zinc-*` / `border-zinc-*` / 各 `bg-zinc-*`、amber/blue の
セマンティック色など）をトークン or `dark:` 対応に置き換え、`.dark` の値を詰める。最後に
`app/globals.css` の `color-scheme: light` 固定を外す。設計は `docs/design-guidelines.md` のボタン配色節。

### 14. ランディングページ + URL/IA 再編（次の着手）
方針は確定（メモリ `project_url_ia.md` が単一の真実）。要点:
- **`/` = LP（公開）**：未ログイン→説明＋ログイン、ログイン済み→「アプリを開く →」(`/trips`) CTA（即リダイレクトはしない）。
- **`/trips` = アプリのホーム = 旅行一覧**（今の `app/page.tsx` をここへ移す）。`/trips/[id]` = 詳細。
- **パス分割(A)採用・サブドメイン(B)不採用**（理由はメモリ参照: 同一オリジンで session cookie がジレンマ無し／共有URL・SEO が apex に集約／ランコス差ゼロ）。
- **共有ヘッダー**：左＝ワードマーク（アプリ内→`/trips`、LP上→`/`）、右＝受信箱＋アバター。auto-hide 無し・パン屑は3層目まで無し。
- **戻り**：`/trips/[id]`→「← 旅行一覧」(`/trips`) は残す（本物の親）。設定/取り込みの「← ホーム」は廃止（ワードマークに集約）。

実装フェーズ（小さく分割。LP本体のコピー/動画/スクショは別タスクで後追い、今回は骨組みと配線）:
1. **ルート移設**：`app/page.tsx`（旅行一覧）→ `app/trips/page.tsx`。`/` は最小LP（ヒーロー＋ログイン/「アプリを開く」CTA）。未ログインで `/trips` 等→`/` へリダイレクト。
2. **共有ヘッダー** `components/app-header.tsx` を作成し `/trips`・`/trips/[id]`・`/settings`・`/import` に適用、各ページの自前トップ行を撤去。
3. **戻り整理**：`/trips/[id]` の「← 旅行一覧」を `/trips` 向けに、設定/取り込みの「← ホーム」削除。
4. **design-guidelines に「ナビ：ヘッダー/戻り/パン屑」節**を追記（単一の真実）。

これで #8 の「他ページのヘッダも同じ並びに揃える」は本項に吸収される。

## 設計負債（機能が一巡したら必ず対処。放置するとデータ移行が辛くなる）

### 通貨モデルが JPY/USD 固定問題
今の実装は primary（`trips.default_currency`）も local（`expenses.local_currency`）も
`CHECK (in ('JPY','USD'))` でハードコード。海外展開を考えると破綻する:

- **primary 通貨が円とは限らない**: US ユーザなら USD primary、EU なら EUR primary。`default_currency` の CHECK を撤廃し通貨マスタ参照へ
- **local 通貨は旅先で変わる**: タイ→THB、EU→EUR。2 通貨固定は非現実的
- **1 trip で複数 local 通貨**: 周遊（タイ+ベトナム）なら 1 旅行に THB と VND が混在。`local_currency` を行ごとに自由に持てる必要がある（スキーマ的には既に per-row なので CHECK を外せば近い）
- **平均レート計算の再設計**: 「同 trip・同通貨の rate 平均をデフォルトに」は通貨が増えると、
  - 通貨ごとに平均を出す（実装はそのまま素直に拡張可）
  - ただし primary が変わると全 expense の換算基準が動く → primary 変更を許すなら rate の持ち方を再考（snapshot か、都度再計算か）
  - 為替の時間変動も本来は効く（旅行序盤と終盤でレート差）。MVP では無視でいいが頭の片隅に
- **通貨コードの正準化**: ISO 4217（3 letter）。通貨マスタテーブル + `expenses.local_currency` を FK 化が筋
- **対応時期**: 海外ユーザに出す直前。それまでは JPY/USD 固定で進めて良い（過剰先取りはしない）が、`CHECK` を緩めて通貨マスタ参照にする migration は機能が一巡したら早めに

## セキュリティ系（機能とは別軸、思い出した時にやる）

- [ ] Supabase Personal Access Token: 過去に漏れた古い token があれば revoke（2026-05-15 に triplot-cli の PAT を `.env.local` に追加。同時に古いものを revoke できていれば消して良い）
- [ ] Google OAuth Client Secret rotate
- [ ] Maps API キーの HTTP referrer 制限確認

## 現在着手中

直近: #14 フェーズ1（ルート移設）完了 — `/` = 最小LP、`/trips` = 旅行一覧。
**次 = #14 フェーズ2**（共有ヘッダー `components/app-header.tsx` を作成して各ページに適用）。方針はメモリ `project_url_ia.md` と #14 を読めば再開できる。
（#1 B の手動 UI 確認、#2 D/C は積み残しの可能性あり。#13 ダークモードの neutral 系トークン化も残）
