# CLAUDE.md

このファイルは Claude Code (claude.ai/code) がこのリポジトリで作業する際のガイドです。

@AGENTS.md

## 技術スタック

- Next.js **16**（App Router）+ React 19 + TypeScript + Tailwind v4
- Supabase（Auth + Postgres + RLS）— `@supabase/ssr` で cookie ベースのセッション管理
- Vitest（node 環境）— `lib/**/*.test.ts` のみ拾う設定
- パスエイリアス: `@/*` → リポジトリルート（`tsconfig.json` と `vitest.config.ts` の両方で設定）

## コマンド

```bash
npm run dev          # next dev
npm run build        # next build
npm run lint         # eslint
npx tsc --noEmit     # 型チェック（pre-commit / pre-push でも実行される）
npm test             # vitest run（一回だけ）
npm run test:watch   # vitest watch
npx vitest run lib/settlement.test.ts        # 単一ファイル
npx vitest run -t "settles greedy"           # テスト名で絞り込み
```

Husky フック:
- `pre-commit`: lint + tsc
- `pre-push`: lint + tsc + test

## アーキテクチャ

### Next.js 16 固有の事情（Next 14/15 の常識を持ち込まない）

- **`proxy.ts`** がリポジトリルートにあり、これが旧 `middleware.ts` の役割。`lib/supabase/proxy.ts` の `updateSession` を呼んで、静的アセット以外の全リクエストで Supabase 認証 cookie をリフレッシュする。export 名は `proxy`（`middleware` ではない）。
- ルートハンドラの `params` は `Promise`。`app/trips/[tripId]/page.tsx` 参照: `params: Promise<{ tripId: string }>` を `await` する。
- `next/headers` の `cookies()` は async。`await cookies()` する（`lib/supabase/server.ts` 参照）。
- API の形が怪しいときは training data ではなく `node_modules/next/dist/docs/` を読むこと。

### Supabase クライアントは 3 種類 — 用途で使い分ける

| ファイル | どこから使う | 理由 |
|---|---|---|
| `lib/supabase/client.ts` | クライアントコンポーネント（`"use client"`） | ブラウザの cookie を扱う |
| `lib/supabase/server.ts` | Server Component / route handler / server action | `next/headers` で cookie 読み書き。RSC からの書き込み失敗は意図的に握りつぶす（セッション更新は proxy 任せ） |
| `lib/supabase/proxy.ts` | `proxy.ts` からのみ | request と response の cookie を同時に更新する必要がある。`getUser()` を呼ばないとリフレッシュが走らない |

### DB モデル（`supabase/migrations/`）

- **`trips.id` は 10 文字 base62 の nanoid（text）で、uuid ではない。** URL に出るため。他のテーブルの主キーは uuid。生成は `public.nanoid(size)` SQL 関数。`create_trip` RPC が衝突時にリトライする。
- **「trip のオーナー」カラムは存在しない。** 権限の根拠は `trip_members`（`trips` × `users` の M:N）への参加だけ。`left_at` でソフト退会。「アクティブメンバー」= `left_at IS NULL`。
- **`visibility = 'shared' | 'private'`** が `places` / `events` / `expenses` のアクセス制御の軸。shared は trip のアクティブメンバー全員に見え、private は作成者のみ。アプリ層ではなく **RLS** で守られている。
- **多通貨対応:** `expenses` は `(local_price, local_currency, rate_to_default)` を per-row で持つ。default_currency 換算値はアプリ側で `local_price × rate_to_default`。デフォルトのレートは「同 trip 内、同通貨の既存 expense の `rate_to_default` の単純平均」を UI 側で算出（履歴が無ければユーザ入力）。trip-level の為替レートテーブルは存在しない。
- **カテゴリ:** `expense_categories` テーブルが trip ごとにカテゴリを持つ。trip 作成時に 11 個（渡航/現地移動/飲食/衣服/エンタメ/土産/宿泊/通信/医療/カジノ/その他）を `seed_default_expense_categories` で seed する。`expenses.category_id` は NOT NULL + `on delete restrict`。
- `expenses` には CHECK 制約: `private` の費用は `splittable = false` でなければならない（private は割り勘不可）。

### RLS のパターン

- `SECURITY DEFINER` の SQL ヘルパーが 2 つ — `is_active_trip_member(trip_id)` と `is_own_member(member_id)` — をポリシーから呼んでいる。`SECURITY DEFINER` なのは意図的で、`trip_members` を参照するときに同じテーブルの RLS が再帰評価されるのを避けるため。
- trip 紐づきテーブルに新しくポリシーを書くときは既存パターンに従うこと: `(visibility = 'shared' AND is_active_trip_member(trip_id)) OR (visibility = 'private' AND is_own_member(created_by_member_id))`。

### 複数行書き込みは `SECURITY DEFINER` RPC で

- `create_trip(...)` が `trip` + 作成者の `trip_member` + デフォルトカテゴリを 1 トランザクションで insert する。RLS をバイパスし、関数の入口で `auth.uid()` を自前チェック。
- `create_expense(...)` が `expenses` + `expense_splits`（splittable のとき）を atomic に insert。category と payer が同 trip の有効値かも関数内で検証。
- 1 つのユーザ操作で RLS 配下の複数テーブルに atomic に書く必要があるときはこのパターンを使う。クライアント側で insert を連鎖させようとしないこと — RLS の評価順や部分失敗のリカバリで詰む。

### 純粋関数の lib（vitest でテスト）

DB を触らないビジネスロジックは `lib/` に純粋関数として置き、隣に `.test.ts` を置く:
- `settlement.ts` — Splitwise 風の greedy 最小トランザクション割り勘（amount は default_currency に換算済み前提）
- `expenseSummary.ts` — shared/private と splittable を考慮した自己負担サマリ（`amountInDefault` 前提）

新しいビジネスロジックも `(input) → output` で書ける限りはここに置く。ユニットテストが書けて壊れにくい。

### DB 型定義

`lib/types/database.ts` は **手書き**で migration と整合させている。ファイル冒頭に `supabase gen types typescript --linked` で再生成できる旨のメモがあるが、それを CI に組み込むまでは migration を変えるたびに手で更新すること。

## 設計方針

**「MVP だから簡易設計でいい」は禁則。** AI で実装コストは小さい前提で、最初から要求にきちんと合う設計で書く。後追いの migration、二重実装、古い実装の残骸を抱えるコストの方が断然高い。

具体例:
- 列挙的なもの（カテゴリ、タグ、種別）は最初からテーブルに分けて FK で参照する。`text + CHECK 制約` で済ます「あとで categories テーブルに昇格」は禁止。
- 「あとで RPC に切り出す」「あとで RLS を厳しくする」のような計画があるなら最初からそれで書く。
- 「ユーザが入力を省略できる」と「DB のカラムを NULL 許可」は別の話。UI で省略可・サーバ側で導出して埋める方が DB スキーマとしては固い（NOT NULL）。NULL 許可は本当にデータが存在しないケースだけ。

## 規約

- UI は **MVP 期間中ライトモード固定**（`app/globals.css` の `color-scheme: light`）。固定が外れるまで `dark:` variant は追加しない。
- アプリ内コピーは日本語、コメントは日英混在 — 周囲のファイルに合わせる。
