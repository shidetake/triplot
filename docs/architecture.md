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
  （1 モバイルコードベース）。地図は react-native-maps（native）。シートは OS 標準（UIKit）のものを使い、
  web の `vaul` のような JS 実装のシートは持ち込まない（[ui-guidelines.md](./ui-guidelines.md) の
  「RN のシート（ボトムシート）は必ず OS ネイティブのものを使う」）。
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

## 環境（本番／確認）— web・mobile 共通

triplot は web・mobile それぞれに「本番」と「確認用」の環境を持つ。**軸は共通**:
確認用は本番と**別の Supabase プロジェクト**（別データベース。本番データに触れない）を見る。
コードに環境分岐は無く、ビルド時に注入する環境変数だけで向き先が変わる。

```mermaid
flowchart LR
  subgraph prodenv["本番"]
    prodweb["web: main ブランチ<br/>→ triplot.app"]
    prodmobile["mobile: production ビルド<br/>→ TestFlight / App Store"]
  end
  subgraph stagingenv["確認用"]
    stagingweb["web: staging ブランチ<br/>→ Vercel Preview URL"]
    previewmobile["mobile: preview ビルド<br/>→ 実機へ直接インストール"]
  end
  prodweb --> prodsupa[("Supabase 本番<br/>cjkiglocsrtnohoxcnfh")]
  prodmobile --> prodsupa
  stagingweb --> stagingsupa[("Supabase staging<br/>xuytnpkvmiduffigimol")]
  previewmobile --> stagingsupa
```

| | 本番 | 確認用 |
|---|---|---|
| **web** | `main` ブランチ → `triplot.app`（push で自動公開） | `staging` ブランチ → Vercel Preview URL（Vercel にログイン済みのメンバーだけ閲覧可） |
| **mobile** | `production` ビルドプロファイル → App Store Connect に submit → TestFlight（Apple の処理待ち 5〜10分） | `preview` ビルドプロファイル → ad-hoc 配布で実機へ直接インストール（Apple の審査を一切通らず数十秒） |
| **DB** | `cjkiglocsrtnohoxcnfh`（東京） | `xuytnpkvmiduffigimol`（東京・本番と別プロジェクト） |
| **mobile bundle id** | `app.triplot.mobile` | `app.triplot.mobile.staging`（本番アプリと同じ端末に共存できる） |

**開発の流れ（web・mobile共通の考え方）**: 変更 → 確認用で見る → 問題なければ本番へ、の順を必ず踏む。
本番へ直接デプロイして確かめる運用はしない（本番=公開そのものなので、確認用と分ける意味が消える）。

- **mobile はさらに手前にシミュレータでの確認がある**（本番/確認用どちらのビルドも作らずローカルで動作確認。
  一番速いが実機固有の挙動は見れない）。3段階の使い分けと具体的なビルドコマンドは `AGENTS.md` を参照。
- **web の staging・mobile の preview は、実装は違えど役割は同じ**（本番データに触れずに実機/ブラウザで
  確認する場所）。preview ビルドは TestFlight を経由しないぶん web の staging によく似ている
  （どちらも「公開前に一度見る場所」であって、TestFlight のような Apple 側の審査プロセスは無い）。
- migration を入れたときは、確認用の DB（staging）にも同じ migration を当てる。当て忘れると確認用だけ
  古いスキーマのまま動き、原因不明の不具合に見える。
- **例外: メール取り込みは確認用環境では確認できない。** 転送先の Cloudflare Email Worker が本番 URL
  （`triplot.app`）に固定されているため（詳細は [`import-flow.md`](design/import-flow.md)）。

## 人手の定期メンテナンス

上記はシステムが自動で回す定期実行。以下は外部プラットフォームの制約で**人手の対応が定期的に要るもの**（BACKLOG には置かない — 完了して消える残件ではなく恒久的に繰り返す運用作業のため）:

| 対象 | 周期 | 対応 |
|---|---|---|
| Apple Sign in の client_secret（JWT） | 最大6ヶ月（Apple の仕様上限） | Apple Developer の同じ Key（.p8）から JWT を再生成し、Supabase Dashboard（Auth → Providers → Apple → Secret Key）に貼り直す。現在の失効日はこの表に書かず、都度 Supabase Dashboard の表示で確認する |
