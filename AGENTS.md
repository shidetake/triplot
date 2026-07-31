# AGENTS.md

このリポジトリで作業する AI エージェント向けのガイド（単一の真実）。
`CLAUDE.md` はこのファイルを読み込むだけで、中身は持たない。

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 技術スタック

- Next.js **16**（App Router）+ React 19 + TypeScript + Tailwind v4
- Supabase（Auth + Postgres + RLS）— `@supabase/ssr` で cookie ベースのセッション管理
- Vitest（node 環境）— `lib/**/*.test.ts` と `components/**/*.test.ts` を拾う設定（後者は DOM 描画を伴わない静的チェック用。実ブラウザ挙動の検証は対象外）
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

全体構成（クライアント＝web＋Expo ネイティブの段構え／外部サービス）は **[docs/architecture.md](docs/architecture.md)** を参照。
方針: web（Next.js）は残し、iOS+Android は Expo（RN）で統一、ロジックは `packages/shared` で共有（Discord 流＝DOM↔native は越えない）。以下はこのリポジトリ（web）内部の事情。

### Next.js 16 固有の事情（Next 14/15 の常識を持ち込まない）

- **`proxy.ts`** がリポジトリルートにあり、これが旧 `middleware.ts` の役割。`lib/supabase/proxy.ts` の `updateSession` を呼んで、静的アセット以外の全リクエストで Supabase 認証 cookie をリフレッシュする。export 名は `proxy`（`middleware` ではない）。
- ルートハンドラの `params` は `Promise`。`app/trips/[tripId]/page.tsx` 参照: `params: Promise<{ tripId: string }>` を `await` する。
- `next/headers` の `cookies()` は async。`await cookies()` する（`lib/supabase/server.ts` 参照）。
- API の形が怪しいときは training data ではなく `node_modules/next/dist/docs/` を読むこと。

### Server Action は完了後に自動でページを再レンダリングする

Next.js App Router は Server Action 完了後、`revalidatePath` の有無に関わらず
React が自動的にページを再レンダリングする。その際 `<html>` 等のサーバー側属性が
DOM に書き戻される。

**やってはいけないパターン**: クライアント JS で `<html class>` を変更した後に
Server Action を呼ぶと、その変更が再レンダリングで消える。

```tsx
// NG: テーマ切替を Server Action 経由にすると React が dark クラスを上書きして消す
await setThemeAction(value);  // → 再レンダリング → <html class=""> で dark 消える
```

**正しいパターン**: サーバー描画コンテンツが変わらない変更（CSS クラス・
ユーザー設定 Cookie 等）は Server Action を使わず `document.cookie` で直書きする。

```tsx
// OK: クライアントから直接 Cookie に書く → 再レンダリングなし → クラスが消えない
document.cookie = `NEXT_THEME=${value}; path=/; max-age=...`;
```

Server Action が必要なのは、サーバー描画コンテンツ（翻訳テキスト等）が
変わる場合だけ（例: `setLocaleAction` は `revalidatePath` が必要）。

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
- **地図の表示範囲は「ピンが集まっているところ」だけに合わせる。** 全ピンの外接矩形を使うと、離れた1点（帰りの空港など）に引っ張られて海の上が中心になる。`clusterPlaces` → `dominantCluster` で主役エリアを選ぶ。中心は必ず `centerOf()` を使い `(west+east)/2` を自前で書かない（日付変更線を跨ぐ bounds は `west > east` で返るため、自前計算だと地球の反対側が中心になる）。詳細は [docs/design/place-map.md](docs/design/place-map.md)。
- **予定の TZ は保存しない。** 通常・終日の `events.start_tz` / `end_tz` は常に NULL で、literal な TZ を持つのは `kind='transit'` だけ（旅行の TZ 境界の唯一の真実源）。通常の予定の実効 TZ は旅程から毎回導出する（`resolveEventTz`）。`start_at` / `end_at` は壁時計（`timestamp without time zone`）。**「全予定に TZ を埋める」方式に変えないこと** — 理由と代償は [docs/design/timezone.md](docs/design/timezone.md) の 0 節。

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

- **`lib/types/database.generated.ts`** が単一の真実。`npm run db:types` で実 DB から自動生成する（`.env.local` の `SUPABASE_ACCESS_TOKEN` を使う）。**手で編集しない。**
- `lib/types/database.ts` は生成物の re-export + 利便用の union 別名（`Currency` など）だけ。生成型は CHECK 制約を読めず通貨等が `string` になるので、DB 境界（fetch 結果の map、RPC 呼び出し）で `as Currency` 等に絞る。
- gen-types は DEFAULT 無しの nullable 関数引数を `string` にしてしまう既知の癖がある（`create_trip` の `p_start_date` 等）。その箇所だけ呼び出し側でキャスト。
- migration を変えたら **必ず `npm run db:types` を実行して再生成し、コミットに含める**。pre-push の `db:types:check` が実 DB とのズレを検出して push を止める（トークンが無い環境ではスキップ）。

## iOS アプリの動作確認は TestFlight で行う

シミュレータでの確認は補助にすぎない（開発ビルド限定の要素が実機と違う挙動を
する。例: expo-dev-client の Tools ボタンが画面右上のタップを吸い、検索窓の ×
が効かないように見える）。**iOS の動作確認は TestFlight に上げて実機で行う。**

- **区切りのタイミングでは、指示を待たず Claude Code の判断でビルドして submit
  まで進める。** 「区切り」＝ iOS の画面に見える変更が一段落し、typecheck /
  lint / テストが通っている状態。
- **TestFlight 用（動作確認用）のビルドはローカルビルドにする。** EAS のビルド枠
  が余っていてもローカルを使い、枠は本番用に温存する。

  ```bash
  cd apps/mobile
  npx eas-cli build --platform ios --profile production --local --non-interactive
  npx eas-cli submit --platform ios --path build-<timestamp>.ipa --non-interactive
  ```

- **本番（市場リリース）用のビルドはクラウドビルドにする**（`--local` を付けない）。
  ローカルビルドは Mac の状態（Xcode の版・キーチェーン・node_modules への
  パッチ適用）に結果が左右されるので、公開するバイナリはクリーンな環境で作る。
- `eas submit` は App Store Connect へのアップロードまで。公開には App Store
  Connect で別途バージョンを作って審査に出す操作が要るので、submit しただけで
  市場に出ることはない。ビルド番号は `eas.json` の `autoIncrement` が自動で
  上げる（バージョン文字列だけは `app.config.ts` の `version` を手で上げる）。

ローカルビルドには Xcode 26.3 以上 / fastlane / login キーチェーンに Apple WWDR
G3 中間証明書が要る。`patches/` の expo-modules-jsi パッチ（Xcode 26.3 の Swift
で `abs` が曖昧になる上流バグ）は root の postinstall で自動適用される。

## web の動作確認は staging（Vercel Preview）で行う

本番にデプロイして確かめる運用はリリースまで。**リリース後は `main` に入れた
ものが即公開されるので、確認は staging で行う**（`main` への push ＝ 公開）。

- **区切りのタイミングでは、指示を待たず Claude Code の判断で `staging` に
  マージして push する。** 「区切り」＝ web の画面に見える変更が一段落し、
  typecheck / lint / テストが通っている状態。iOS を TestFlight に上げるのと
  同じ考え方で、確認できる場所まで自分で運ぶ。
- **確認はプレビュー URL で行う。** `https://triplot-git-staging-hdtks-projects.vercel.app`
  （Vercel Authentication が有効＝Vercel にログイン済みのチームメンバーだけが
  開ける）。ブランチ固定 URL なので Google OAuth に登録できている。
- **`main` へのマージは確認が済んでから。** これが本番公開そのものなので、
  ユーザーの指示なしに `main` へは入れない。
- **migration を入れたら staging にも当てる**（下の「staging DB への migration」）。
  当て忘れるとプレビューだけ古いスキーマで動いて原因不明の不具合に見える。

```
feature ブランチ → staging にマージ → プレビュー URL で確認 → main にマージ → 本番
```

環境の対応。**コード側に環境の分岐は無く**、Vercel の環境変数スコープだけで
切り替わる（`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` の
Preview スコープが staging Supabase を向いている）:

| | ブランチ | Vercel | Supabase |
|---|---|---|---|
| 本番 | `main` | Production（`triplot.app`） | `cjkiglocsrtnohoxcnfh` |
| 確認 | `staging` | Preview | `xuytnpkvmiduffigimol` |

staging を見ているかの判別は、ログイン後の旅行一覧で付く（staging はテスト
データしか入っていない）。本番と同じ旅行が並んだら Preview スコープの環境変数が
効いていない。

### Google OAuth まわりの制約 — 確認は staging ブランチに集約する

Google Cloud Console の OAuth クライアント（「Web」）に、本番と並べて staging の
設定を入れてある。**2つの欄は用途が違うので混同しないこと。**

| 欄 | 何に使われるか | 登録済みの値 |
|---|---|---|
| 承認済みのリダイレクト URI | ログイン（Supabase 経由のリダイレクト） | 本番/staging それぞれの `https://<ref>.supabase.co/auth/v1/callback` |
| 承認済みの JavaScript 生成元 | **カレンダーエクスポート**（`calendar-export-dialog.tsx` が GIS のポップアップ・トークンフローでブラウザから直接 Google を叩く） | `https://triplot.app` / `http://localhost:3000` / staging の Vercel URL |

**JavaScript 生成元はワイルドカードを受け付けない。** そのため staging 以外の
feature ブランチのプレビューでは、ログインや他の機能は動くが**カレンダー
エクスポートだけ動かない**。エクスポートを確認したいときは staging にマージ
してから見る（ブランチごとに生成元を登録して回らない）。

`NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` も Preview スコープに要る（値は本番と同じ）。

### staging DB への migration

```bash
npm run db:push:staging   # scripts/db-push-staging.sh
```

接続文字列は gitignore された `apps/web/.env.staging.local` の
`SUPABASE_STAGING_DB_URL` から読む。本番は `supabase link` 済みプロジェクトを
見る従来どおりの経路で、**link を張り替えない**（どちらを触っているかが
コマンドから自明であること優先）。スクリプトは接続文字列に本番の project ref が
混ざっていたら止める。

`database.generated.ts` の生成元は本番のまま（`npm run db:types`）。staging と
本番でスキーマが揃っている前提なので、**migration を入れたら両方に当てる**こと。

## 設計方針

**「簡易設計でいい／後で直す」は禁則。** AI で実装コストは小さい前提で、最初から要求にきちんと合う設計で書く。後追いの migration、二重実装、古い実装の残骸を抱えるコストの方が断然高い。

具体例:
- 列挙的なもの（カテゴリ、タグ、種別）は最初からテーブルに分けて FK で参照する。`text + CHECK 制約` で済ます「あとで categories テーブルに昇格」は禁止。
- 「あとで RPC に切り出す」「あとで RLS を厳しくする」のような計画があるなら最初からそれで書く。
- 「ユーザが入力を省略できる」と「DB のカラムを NULL 許可」は別の話。UI で省略可・サーバ側で導出して埋める方が DB スキーマとしては固い（NOT NULL）。NULL 許可は本当にデータが存在しないケースだけ。

## Migration ポリシー（開発期間中）

- **既存データ向けの backfill / データ補修コードを migration に書かない。** 既存データはテスト用なので、邪魔なら `truncate ... cascade` か手動 SQL で消す。`DO $$ ... LOOP ... $$` のような後付け seed は書かないこと（増えてくと意図不明のごみコードが migration に溜まる）。
- 必要なら migration の先頭で `truncate <table> cascade` を入れて「真っ新な状態から動く」設計にする。
- 既存 migration ファイルの書き直し（破壊的変更）は OK。Git 履歴より最終的なスキーマの綺麗さ優先。
- 「本番運用フェーズに入った」とユーザが明示的に言うまでこの方針。それ以降は backfill を真面目に書く。

## UI 規約

UI / アイコン / ボタン配色 / コピー / ナビ / インタラクションの規約は **[docs/ui-guidelines.md](docs/ui-guidelines.md)** に集約（単一の真実）。下記 `@` で取り込む。
（"design" は設計＝[システム構成](docs/architecture.md)と紛れるので、見た目側はこの「UI ガイドライン」に名前を分けている。）

@docs/ui-guidelines.md
