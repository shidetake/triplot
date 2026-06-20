# triplot

旅行をみんなで計画して、費用を割り勘するためのアプリ。旅行ごとにメンバー・場所・予定・費用を持ち、
費用は多通貨に対応した Splitwise 風の最小トランザクション割り勘で精算する。

## 技術スタック

- **Next.js 16**（App Router）+ React 19 + TypeScript + Tailwind CSS v4
- **Supabase**（Auth + Postgres + RLS）— `@supabase/ssr` による cookie ベースのセッション管理
- **shadcn/ui**（style `base-nova`＝Base UI 製）+ Lucide / Material Symbols アイコン
- **Google Maps**（`@vis.gl/react-google-maps`）— 場所の検索・地図表示
- **Vitest** — `lib/**/*.test.ts` の純粋関数ユニットテスト

## 必要なもの

- Node.js（`.nvmrc` / `package.json` の engines に準拠）
- Supabase プロジェクト（ローカルは Supabase CLI でも可）
- Google Maps API キー

`.env.local` に最低限つぎの値を設定する（キー名は `lib/supabase/*` と地図コンポーネントを参照）:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=...        # 地図のスタイル ID
NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=...    # Google ログイン
SUPABASE_ACCESS_TOKEN=...                 # db:types で実 DB から型生成するときに使う
```

## セットアップと起動

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開く。

## コマンド

```bash
npm run dev          # 開発サーバ
npm run build        # 本番ビルド
npm run lint         # ESLint
npx tsc --noEmit     # 型チェック（pre-commit / pre-push でも実行）
npm test             # Vitest（1 回だけ）
npm run test:watch   # Vitest（watch）
npm run db:types     # 実 DB から DB 型を再生成（migration を変えたら必須）
```

Husky フック: `pre-commit` で lint + tsc、`pre-push` で lint + tsc + test + DB 型のズレ検出。

## ディレクトリ構成

| パス | 役割 |
|---|---|
| `app/` | App Router のページ・route handler・server action |
| `components/` | UI 部品（`components/ui/` が shadcn/ui） |
| `lib/` | ビジネスロジック（`settlement.ts` 等の純粋関数）・Supabase クライアント・型 |
| `supabase/migrations/` | DB スキーマ・RLS・RPC（単一の真実） |
| `proxy.ts` | Next.js 16 の旧 middleware 相当。認証 cookie をリフレッシュ |
| `docs/` | アーキテクチャ・機能設計・デザインガイドライン |

## ドキュメント

- [アーキテクチャ概要](./docs/architecture.md) — 使っている外部サービス（Dynadot / Cloudflare / Vercel / Supabase / AI Gateway）と役割の 1 枚図
- [費用インポート（メール転送）設計](./docs/import-flow.md) — シーケンス図・状態遷移図つきの機能設計
- [デザインガイドライン](./docs/design-guidelines.md) — UI / アイコン / 配色 / コピーの規約（単一の真実）
- [CLAUDE.md](./CLAUDE.md) / [AGENTS.md](./AGENTS.md) — AI エージェント・開発者向けの作業ガイドとアーキテクチャの要点

## デプロイ

`main` への push で Vercel が本番に自動デプロイする（関数リージョンは `hnd1`、Supabase は東京 `ap-northeast-1`）。
