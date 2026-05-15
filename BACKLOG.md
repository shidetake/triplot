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

B: 手動 UI 確認待ち → 終わったら次は D（週ビュー） or C（地図ピン）
