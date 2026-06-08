# アーキテクチャ概要

triplot がどの外部サービスをどう使っているかの俯瞰図。詳細な機能設計は
[`import-flow.md`](./import-flow.md) などの個別ドキュメントを参照。

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
  end

  subgraph vercel[Vercel ・ hnd1 東京]
    app[Next.js 16 アプリ<br/>App Router]
    cron[Cron<br/>expire / retry]
  end

  subgraph supa[Supabase ・ 東京 ap-northeast-1]
    pg[(Postgres<br/>+ RLS)]
    auth[Auth]
  end

  gw[Vercel AI Gateway<br/>gemini-2.5-flash]

  dynadot -. ネームサーバ委任 .-> dns
  user -->|HTTPS triplot.app| app
  app <-->|データ / RLS| pg
  app <-->|セッション| auth
  store -->|レシートを転送| email
  email --> worker
  worker -->|POST /api/inbound-email| app
  app -->|抽出 / マージ| gw
  cron -->|GET /api/cron/*| app
```

## 役割

| サービス | 役割 | 補足 |
|---|---|---|
| **Dynadot** | ドメインのレジストラ（`triplot.app` の登録・更新） | ネームサーバは Cloudflare に委任済み。DNS 自体は触らない |
| **Cloudflare** | DNS（ネームサーバ）＋ メール受信（Email Routing → Email Worker） | レシート転送メールを受け、Worker が webhook で Vercel に push |
| **Vercel** | Next.js 16 アプリのホスティング＋ Cron | リージョン `hnd1`（東京）に固定。`main` への push で自動デプロイ |
| **Supabase** | Postgres（+ RLS）＋ Auth | 東京 `ap-northeast-1`。Vercel と同一都市圏に co-locate（RTT 削減） |
| **Vercel AI Gateway** | LLM アクセス（レシート抽出・マージ判定） | 既定モデル `google/gemini-2.5-flash`。将来は BYOK（ユーザのキー）も |

## ドメインとルーティング

- 本番ドメイン: `https://triplot.app`（apex が canonical、`www` は apex へ 308 リダイレクト）。
- Vercel 向けレコードは Cloudflare 上で **DNS only（グレー雲）**。`*.vercel.app` もフォールバック/プレビュー用に残置。
- コードは origin 追従でドメイン非依存（URL のハードコード無し）。Supabase Auth の Site URL は `https://triplot.app`。

## デプロイとリージョン

- **デプロイ**: GitHub `main` への push がトリガーの自動デプロイ。`vercel` CLI の手動デプロイは使わない。
- **リージョン**: Vercel 関数 `hnd1` × Supabase `ap-northeast-1` を東京に揃え、サーバ側 Supabase クエリの太平洋越え RTT 積み上げを避ける。複数の独立クエリは `Promise.all` で並列化する方針。

## Cron（Vercel）

| パス | スケジュール | 役割 |
|---|---|---|
| `/api/cron/expire-inbound` | 日次 | 90日経った未確定/失敗/合体の受信メール行を削除（保持最小化） |
| `/api/cron/retry-extract` | 日次 | 抽出失敗の自動リトライのバックストップ（主トリガは受信箱の `after()`） |

> **Hobby プランの制約**: Vercel Cron は最大2本・各1日1回（プラン全体）。現在2本で上限。
> 分単位の自動実行が要るなら Cloudflare Cron Triggers / Supabase pg_cron など外部スケジューラで
> Vercel エンドポイントを叩く（プラン非依存）。詳細は [`import-flow.md`](./import-flow.md) のリトライ節。
