# triplot

旅行をみんなで計画して、費用を割り勘するためのアプリ。旅行ごとにメンバー・場所・予定・費用・TODO・ノートを持ち、
費用は多通貨に対応した Splitwise 風の最小トランザクション割り勘で精算する。レシートや予約のメールを転送すると、
AI が費用・予定・場所の下書きにして取り込む。

web（`https://triplot.app`）と iOS アプリで公開している。

## 構成（モノレポ）

| パス | 役割 |
|---|---|
| `apps/web/` | web（Next.js 16 App Router + React 19 + Tailwind CSS v4 + shadcn/ui）。Vercel にデプロイ |
| `apps/mobile/` | iOS アプリ（Expo / React Native） |
| `packages/shared/` | web と iOS が共有する型・純ロジック・データアクセス層・文言（`messages/`） |
| `supabase/` | DB スキーマ・RLS・RPC（`migrations/` が単一の真実）と Edge Function |
| `workers/` | Cloudflare の Worker（メールの受け口・取り込みの再試行の心拍） |
| `scripts/` | 型生成・各種チェック・iOS のビルドと提出・取り込みのテスト用の道具 |
| `docs/` | アーキテクチャ・開発手順・DB・UI ガイドライン・機能ごとの設計 |

バックエンドは Supabase（Auth + Postgres + RLS）で、web と iOS の共通。

## セットアップと起動

```bash
npm install
npm run dev          # web の開発サーバ（http://localhost:3000）
npm run dev:mobile   # iOS の開発サーバ（Expo）
```

環境変数は `apps/web/.env.example` を参照。ローカルを staging に向ける設定や開発用ログインなど、
手順の詳細は [docs/development.md](./docs/development.md) にある。

## よく使うコマンド

```bash
npm run lint         # ESLint（全ワークスペース）
npm run typecheck    # 型チェック（全ワークスペース）
npm test             # Vitest（純関数のみ・DB に触らない）
npm run test:db      # staging の実 DB に繋ぐテスト（手で走らせる）
npm run db:types     # 実 DB から DB 型を再生成（migration を変えたら必須）
npm run db:push:staging  # migration を staging DB に当てる
```

Husky フック: `pre-commit` で lint + 型チェック + 秘密の値の混入チェック、`pre-push` でそれに加えて
テスト・クライアント境界・DB 型のズレ・staging への migration の当て忘れ・テーブルの grant の書き忘れを検出する。

## ドキュメント

- [アーキテクチャ概要](./docs/architecture.md) — クライアント構成（web ＋ Expo ネイティブ）と外部サービス（Dynadot / Cloudflare / Vercel / Supabase / AI Gateway / Resend）の俯瞰
- [開発ガイド](./docs/development.md) — 開発の手順・コマンド・コードの仕組み・確認環境（staging）・iOS のビルド
- [データベース](./docs/database.md) — DB の設計と読み書きの決まり
- [UI ガイドライン](./docs/ui-guidelines.md) — UI / アイコン / 配色 / コピー / インタラクションの規約
- [バージョン表記](./docs/versioning.md) — web・iOS のバージョン番号とリリース手順
- `docs/design/` — 機能ごとの設計（メール取り込み・タイムゾーン・地図・課金・ログイン方法など）
- [Issue](https://github.com/shidetake/triplot/issues) — 残件（これからやること）
- [CLAUDE.md](./CLAUDE.md) / [AGENTS.md](./AGENTS.md) — AI エージェント専用の作業指示（人間向けの内容は docs/ にある）

## デプロイ

- **web**: `main` に PR が入ると Vercel が本番に自動デプロイする（`main` へは PR からしか入れない）（関数リージョンは `hnd1`、Supabase は東京
  `ap-northeast-1`）。確認は `staging` ブランチ（Vercel Preview ＋ staging の Supabase）で行う。
- **iOS**: `npm run ios:build` → `npm run ios:submit` で TestFlight へ。手順は docs/development.md。
- **Cloudflare の Worker**: `npm run workers:deploy -- <名前>`。main への push では出ない。
