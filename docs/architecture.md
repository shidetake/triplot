# アーキテクチャ概要

triplot のアーキテクチャ俯瞰（クライアント構成 ＋ 外部サービス）。詳細な機能設計は
[`import-flow.md`](./design/import-flow.md)・[`timezone.md`](./design/timezone.md) などの
個別ドキュメントを参照。

## クライアント構成（web ＋ ネイティブ）

triplot は **1 バックエンド（Supabase）＋ 複数クライアント**。方針は「**同じ描画ターゲット内では統一し、
ターゲットをまたぐ境界では分ける**」（**Discord と同じ思想**）。web を捨てて 1 UI に畳むことはしない。

- **web（広い画面＝PC/iPad ・ 狭い画面＝モバイル）** … Next.js 16（React DOM ＋ Tailwind）。Responsive で
  出し分ける（モバイル＝ボトムシート、広い画面＝ポップオーバー等）。この 2 つは **同一コードベース**。
- **ネイティブ（iOS ＋ Android）** … **Expo（React Native）** で UI を別実装。iOS/Android はここで **統一**
  （1 モバイルコードベース）。地図は react-native-maps（native）。
- **共有するもの** … 型・純ロジック（`settlement` 等）・データアクセス層・Zod スキーマを `packages/shared`
  に置き web/native 双方から import（モノレポ）。**backend（Supabase の RLS/RPC）は全クライアント共通**。
- **共有しないもの** … UI。React DOM（web）と RN の native 部品（mobile）は描画層が別物なので **統一しない**
  （`react-native-web` で web まで畳むのは、良くできた既存 web を作り直す割に劣化するため不採用）。

```mermaid
flowchart TD
  subgraph clients[クライアント（UI は分ける）]
    web["web（Next.js / React DOM）<br/>広い画面 ＋ モバイル＝Responsive"]
    native["native（Expo / React Native）<br/>iOS ＋ Android＝統一"]
  end
  shared["packages/shared<br/>型・純ロジック・データ層・スキーマ"]
  be[("Supabase<br/>Postgres + RLS/RPC + Auth")]
  web --> shared
  native --> shared
  web --> be
  native --> be
```

> 「完全 1 コードベース」の意味は **(a) iOS＋Android の統一（RN）** と **(b) ロジック共有**であって、
> **web まで含めた 1 UI ではない**。Discord も web/desktop＝React DOM（Electron）、mobile＝RN で、有名な
> 「90% 共有」は iOS↔Android 間の話。triplot も同様に web は残す。

**移行の段取り（未着手）**: ① モノレポ化して `packages/shared` にロジック抽出 → ② Expo アプリ雛形＋Supabase 接続
→ ③ タブ（日程/地図/費用/TODO）を 1 つずつ移植。変更系は今 Next.js の server action 中心なので、RN からも
使えるよう「Supabase client を受け取る共有関数」か API エンドポイントに出すのが要点。

## サービス構成

```mermaid
flowchart LR
  user([ユーザー<br/>ブラウザ])
  store([レシート送信元<br/>Uber / 銀行 / 店])

  dynadot[Dynadot<br/>レジストラ]

  subgraph cf[Cloudflare]
    dns[DNS<br/>ネームサーバ]
    email[Email Routing<br/>catch-all]
    worker[Email Worker]
    heartbeat[Cron Worker<br/>毎分の心拍]
  end

  subgraph vercel[Vercel ・ hnd1 東京]
    app[Next.js 16 アプリ<br/>App Router]
    cron[Cron<br/>expire（日次）]
  end

  subgraph supa[Supabase ・ 東京 ap-northeast-1]
    pg[(Postgres<br/>+ RLS)]
    auth[Auth]
  end

  gw[Vercel AI Gateway<br/>gemini-2.5-flash]
  resend[Resend<br/>トランザクションメール]

  dynadot -. ネームサーバ委任 .-> dns
  user -->|HTTPS triplot.app| app
  app <-->|データ / RLS| pg
  app <-->|セッション| auth
  store -->|レシートを転送| email
  email --> worker
  worker -->|POST /api/inbound-email| app
  app -->|抽出 / マージ| gw
  app -->|フィードバック受付確認 / 管理者通知| resend
  cron -->|GET /api/cron/expire-inbound| app
  heartbeat -->|GET /api/cron/retry-extract| app
```

## 役割

| サービス | 役割 | 補足 |
|---|---|---|
| **Dynadot** | ドメインのレジストラ（`triplot.app` の登録・更新） | ネームサーバは Cloudflare に委任済み。DNS 自体は触らない |
| **Cloudflare** | DNS（ネームサーバ）＋ メール受信（Email Routing → Email Worker）＋ リトライ心拍（Cron Worker・毎分） | レシート転送メールを受けて Vercel に push。毎分 retry エンドポイントを叩く |
| **Vercel** | Next.js 16 アプリのホスティング＋ Cron | リージョン `hnd1`（東京）に固定。`main` への push で自動デプロイ |
| **Supabase** | Postgres（+ RLS）＋ Auth | 東京 `ap-northeast-1`。Vercel と同一都市圏に co-locate（RTT 削減） |
| **Vercel AI Gateway** | LLM アクセス（レシート抽出・マージ判定） | 既定モデル `google/gemini-2.5-flash`。将来は BYOK（ユーザのキー）も |
| **Resend** | トランザクションメール送信（フィードバック受付確認・管理者への新着通知） | `RESEND_API_KEY` 未設定なら送信をスキップ（ローカル/プレビューで機能自体は動く）。詳細は [`feedback.md`](./design/feedback.md) |

## 予定のタイムゾーンは保存せず旅程から導出する

**通常・終日の予定はタイムゾーンを持たない（`start_tz` / `end_tz` は常に NULL）。**
literal な TZ を持つのは `kind='transit'`（時差移動）だけで、それが旅行全体の
TZ 境界の唯一の真実源になる。通常の予定の実効 TZ は、その日付が旅程上どの区間に
入るかを毎回引いて決める（`resolveEventTz` / `buildTripTzTimeline`）。DB の CHECK
制約 `events_normal_no_literal_tz_chk` / `events_transit_endpoints_chk` がこの
不変条件を強制している。`start_at` / `end_at` は `timestamp without time zone`＝
**壁時計**で、UTC ではない。

### なぜ「毎回導出」なのか（＝全予定に TZ を埋めない理由）

**決め手は入力順序の非対称性。** 旅行の計画は「中日の予定を先に立てて、フライトは
後から確定する」順序になることが多い。

- **導出方式**: 後からフライトを入れた瞬間、既存の予定の実効 TZ が自動で正しくなる。
  何も書き換えない。
- **埋める方式**: フライトが決まったタイミングで、**既存の全予定の TZ を導出して
  書き戻す**処理が要る。旅程が動くたびに再計算とカスケード更新が発生し、
  「どの順序で入力したか」で結果が変わりうる。入力順序に依存する不具合は再現条件が
  掴みにくく、デバッグが難しい。

埋める方式でも「TZ を聞かずに自動で埋める」なら結局同じ導出ロジックが要る。違いは
**その導出結果を凍結するか、毎回やり直すか**だけで、凍結する側が余分に
「陳腐化した値を直す責任」を負う。だから導出方式を採る。

### 代償

乗継当日の曖昧性。成田を 4/28 に発ってホノルルに 4/28 に着く日、「4/28 15:00 の
予定」が出発側（東京）か到着側（ホノルル）かは日付だけでは決まらない。これを解くのが
`events.tz_disambig_transit_id` / `tz_disambig_side` の 2 列と、それを選ばせる UI。
**この複雑さは導出方式の代償として意図的に受け入れているもの**で、消そうとしないこと
（埋める方式に戻すと、上の書き戻し問題と交換になるだけ）。

## ドメインとルーティング

- 本番ドメイン: `https://triplot.app`（apex が canonical、`www` は apex へ 308 リダイレクト）。
- Vercel 向けレコードは Cloudflare 上で **DNS only（グレー雲）**。`*.vercel.app` もフォールバック/プレビュー用に残置。
- コードは origin 追従でドメイン非依存（URL のハードコード無し）。Supabase Auth の Site URL は `https://triplot.app`。

## デプロイとリージョン

- **デプロイ**: GitHub `main` への push がトリガーの自動デプロイ。`vercel` CLI の手動デプロイは使わない。
- **リージョン**: Vercel 関数 `hnd1` × Supabase `ap-northeast-1` を東京に揃え、サーバ側 Supabase クエリの太平洋越え RTT 積み上げを避ける。複数の独立クエリは `Promise.all` で並列化する方針。

## 定期実行（2系統）

| 駆動 | パス | 間隔 | 役割 |
|---|---|---|---|
| **Vercel Cron** | `/api/cron/expire-inbound` | 日次 | 90日経った未確定/失敗/合体の受信メール行を削除（保持最小化） |
| **Cloudflare Cron Worker** | `/api/cron/retry-extract` | **毎分** | 保留中の抽出を reconcile（期限の来た error を再試行＋枠の空いた over_quota を再抽出） |

> **なぜ2系統か**: Vercel Hobby の Cron は各1日1回（プラン全体）なので、分単位が要る
> リトライは Cloudflare の Cron Worker（毎分・無料・プラン非依存）に逃がす。心拍 Worker は
> 状態を持たず `/api/cron/retry-extract` を叩くだけの独立ユニット（メール Worker とは別物）。
> リトライの設計は [`import-flow.md`](./design/import-flow.md) のリトライ節を参照。

## 人手の定期メンテナンス

上記はシステムが自動で回す定期実行。以下は外部プラットフォームの制約で**人手の対応が定期的に要るもの**（BACKLOG には置かない — 完了して消える残件ではなく恒久的に繰り返す運用作業のため）:

| 対象 | 周期 | 対応 |
|---|---|---|
| Apple Sign in の client_secret（JWT） | 最大6ヶ月（Apple の仕様上限） | Apple Developer の同じ Key（.p8）から JWT を再生成し、Supabase Dashboard（Auth → Providers → Apple → Secret Key）に貼り直す。現在の失効日はこの表に書かず、都度 Supabase Dashboard の表示で確認する |
