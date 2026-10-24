# 開発ガイド

triplot を開発するときの手順と、コードを書く上で知っておくべき仕組み。
システム全体の構成は [`architecture.md`](./architecture.md)、DB の決まりは
[`database.md`](./database.md)、見た目の規約は [`ui-guidelines.md`](./ui-guidelines.md)。

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
npm test             # vitest run（一回だけ。純関数のみ・DB に触らない）
npm run test:db      # 実 DB（staging）に繋ぐテスト。手で走らせる（下記）
npm run test:seed-emails -- --set <組>  # メール取り込みのテストデータを作り直す（下記）
npm run test:import-status  # 取り込みの結果を見る（状態の内訳・合体の残骸）
npm run test:watch   # vitest watch
npx vitest run lib/settlement.test.ts        # 単一ファイル
npx vitest run -t "settles greedy"           # テスト名で絞り込み
```

### 実 DB のテスト（`npm run test:db`）

純関数のテストでは**原理的に捕まらない壊れ方**がある。トリガと cascade の
噛み合わせ、RLS、RPC の引数のズレなど、DB の中でしか起きないもの。実際、
「移動の予定とそれを参照する予定がある旅行を削除できない」不具合は、
ユニットテストを何本足しても見つからなかった。

`packages/shared/dbtests/` がその層で、旅行を作って中身を入れて最後に消す、
という1本を持つ。**staging に繋ぐ**（資格情報は gitignore された
`apps/web/.env.development.local`＝web の開発用ログインと同じもの。無ければ
skip する。本番を向いていたら例外で止まる）。

- `npm test` とは別。Docker も資格情報も要らない `npm test` が pre-commit /
  pre-push で回り、こちらは**手で**走らせる（提出前とスキーマを触った時）。
  `dbtests/` は `src/` の外に置いてあるので、通常のテストが拾うことはない。
- staging はプレビュー確認にも使う場所なので、**自分で作った旅行の中だけ**を
  触る。`truncate` もユーザー単位の削除もしない。後片付けは削除機能そのもの
  （＝後始末がテスト対象を兼ねる）で、落ちて消せなかったぶんは次回の開始時に
  接頭辞 `__dbtest__` で拾って消す。
- **中間状態をアサートしない**。値の形は純関数側のテストの仕事で、ここは
  操作が通るか / 最後に消えるかだけを見る（落ちた時に原因を追いやすくする）。

## 規約は機械に守らせる

Husky フック: `pre-commit` は lint + tsc、`pre-push` は lint + tsc + test。
これに下表の判定が乗る。PR には GitHub Actions の CI（`.github/workflows/ci.yml`）が
同じ検査のうち資格情報の要らないものを走らせる（手元のフックを通らない Renovate の PR のため）。

**規約を文書だけに置かない。** 手順として書けば、思い出した時にしか実行され
ない＝忘れた時に素通りする。機械が判定できるものはフックか、その操作を行う
コマンド自体に埋める。**下表のものは覚えなくてよい**（外すと止まる）。

| 守りたいこと | どこで止まるか |
|---|---|
| 転送先アドレス等・Google の API キーをコミットする | `pre-commit`（`check:no-secrets`。値は環境ファイルから読み、Google のキーは形で探す。ログには出さない） |
| `database.generated.ts` が実 DB とズレる | `pre-push`（`db:types:check`） |
| migration を staging に当て忘れる | `pre-push`（`check:staging-migrations`） |
| テーブルを作る migration に grant を書き忘れる | `pre-push`・CI（`check:migration-grants`） |
| クライアント境界を越える import | `pre-push`（`check:client-boundary`） |
| Expo の部品・SDK に縛られた部品を足したのに Renovate の除外に入れ忘れる | `pre-push`・CI（`check:renovate-expo`） |
| Expo の部品が SDK の組み合わせから外れる | `pre-push`・CI（`check:expo-deps`） |
| 色トークンを外したクラス（`text-zinc-` 等）・`window.confirm` | ESLint（`apps/web/eslint.config.mjs`） |
| 画面遷移を `router.push` で直に書く | ESLint（`apps/mobile/eslint.config.js`） |
| 起動しない ipa を TestFlight に出す | `npm run ios:build` / `npm run ios:submit` |

## メール取り込みの動作確認

### テストデータを流す（`npm run test:seed-emails`）

取り込みの動作確認は、**実際にメールを転送するところからやる**のが一番実物に近い。
その1往復を1コマンドにしてある。

```bash
npm run test:seed-emails -- --set la            # 受信箱を空にして、その組を全部転送し直す
npm run test:seed-emails -- --set hawaii -n 5   # 5通だけ（軽い確認）
npm run test:seed-emails -- --set la --dry-run  # 消さない・送らない。対象と件数だけ見る
npm run test:seed-emails -- --set la --keep-inbox # 受信箱を残して転送だけ
npm run test:import-status                      # 取り込みの結果を見る（下記）
```

**どの組を送るかは必ず選ぶ。まとめて全部は送らない。** 受信箱は毎回空にしてから
転送するので、組を跨いで送ると「今どの旅行を見ているか」が混ざる。2つ流したい時は
2回叩く。組は `apps/web/.env.local` に1行足すと増える
（`TRIPLOT_TEST_GMAIL_LABEL_<組の名前>=<Gmail のラベル>`）。

やることは2つ。**staging の受信箱を空にしてから、Gmail の指定ラベルのメールを
1通ずつ staging の取り込みアドレスへ転送する**（まとめて1通にしない。1通=1レシートでないと取り込みの検証に
ならない）。転送そのものは `scripts/forward-gmail.mjs`（Gmail API を直接叩く
汎用ツール。単体でも使える）で、`scripts/seed-import-emails.mjs` が手順の側。

- **消すのは転送先アドレス宛の行だけ。** 同じ DB に他ユーザーの受信箱が同居して
  いるので、テーブルごと `truncate` しない。`inbound_drafts` は cascade で消える。
  確定済みの予定・費用は旅行側に残る（下書きの FK は `on delete set null`）。
- **転送済みの記録は毎回捨てる。** 同じメールを何度でも流し直せることが目的なので、
  記録が残っていると全部スキップされる。`forward-gmail.mjs` を単体で使うときの
  記録とは別ファイル（`~/.gmail-mcp/seed_state.json`）。
- 転送先アドレスと Gmail のラベルは gitignore された `apps/web/.env.local` の
  `TRIPLOT_RECEIPTS_ADDRESS` / `TRIPLOT_TEST_GMAIL_LABEL_*` から読む（転送先は
  知っていれば誰でもその受信箱にメールを流し込めるため）。転送先は staging の
  開発用アカウントのアドレス（`receipts-staging+<トークン>@triplot.app`）。
- DB は staging を読み書きする（`test:import-status` も同じ）。接続文字列は
  `apps/web/.env.staging.local` の `SUPABASE_STAGING_DB_URL`。
- Gmail の認証は `~/.gmail-mcp/`（`gcp-oauth.keys.json` と `credentials.json`）。
  切れていればブラウザが開いて再認証する。
- 転送してから取り込みが終わるまでは cron 次第で時間がかかる。件数の推移は
  `inbound_emails` の `status` を数えると分かる。

### 結果を見る（`npm run test:import-status`）

流し直したあとの確認はこのコマンドで行う。**手で SQL を書いて数えない** —— 手順に
すると、書いた人が覚えている項目しか見ない。見落としたくないものが増えたら
`scripts/import-status.mjs` に足す。

今見ているもの: メールの状態の内訳（取り込み待ち・抽出済み・合体済み・確定済み・
失敗）、未確定の下書きの件数、**合体で吸収された側に下書きが残っていないか**。
最後のものは吸収された側が下書きを持たない設計に反する状態で、再発するかを
毎回見ている。

## web のコードの仕組み

### Next.js 16 固有の事情（Next 14/15 の常識を持ち込まない）

- **`proxy.ts`** がリポジトリルートにあり、これが旧 `middleware.ts` の役割。`lib/supabase/proxy.ts` の `updateSession` を呼んで、静的アセット以外の全リクエストで Supabase 認証 cookie をリフレッシュする。export 名は `proxy`（`middleware` ではない）。
- ルートハンドラの `params` は `Promise`。`app/trips/[tripId]/page.tsx` 参照: `params: Promise<{ tripId: string }>` を `await` する。
- `next/headers` の `cookies()` は async。`await cookies()` する（`lib/supabase/server.ts` 参照）。

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

このほかに、全部のデータを読み書きできる service role のクライアント
（`lib/supabase/service.ts`）がある。使ってよい場面は [`database.md`](./database.md)
の「データを誰に読ませるか」。

### 純粋関数の lib（vitest でテスト）

DB を触らないビジネスロジックは `lib/` に純粋関数として置き、隣に `.test.ts` を置く:
- `settlement.ts` — Splitwise 風の greedy 最小トランザクション割り勘（amount は default_currency に換算済み前提）
- `expenseSummary.ts` — shared/private と splittable を考慮した自己負担サマリ（`amountInDefault` 前提）

新しいビジネスロジックも `(input) → output` で書ける限りはここに置く。ユニットテストが書けて壊れにくい。

## 設計方針

**「簡易設計でいい／後で直す」は禁則。** AI で実装コストは小さい前提で、最初から要求にきちんと合う設計で書く。後追いの migration、二重実装、古い実装の残骸を抱えるコストの方が断然高い。

具体例:
- 列挙的なもの（カテゴリ、タグ、種別）は最初からテーブルに分けて FK で参照する。`text + CHECK 制約` で済ます「あとで categories テーブルに昇格」は禁止。
- 「あとで RPC に切り出す」「あとで RLS を厳しくする」のような計画があるなら最初からそれで書く。
- 「ユーザが入力を省略できる」と「DB のカラムを NULL 許可」は別の話。UI で省略可・サーバ側で導出して埋める方が DB スキーマとしては固い（NOT NULL）。NULL 許可は本当にデータが存在しないケースだけ。

## web をローカルで見る（開発用ログイン）

web の入口は OAuth（Google / Apple）だけなので、自動テストや AI エージェントは
そのままではサインインできない。iOS と同じ**開発用ログイン**を web にも置いてある
（`components/dev-sign-in-button.tsx`。LP に「開発用ログイン」のリンクが出る）。

- **`next dev` の時だけ有効**。`process.env.NODE_ENV === "development"` で分岐して
  いるので、本番ビルドにはボタン自体が含まれない。
- 資格情報とローカルの向き先は gitignore された `apps/web/.env.development.local`:
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` を **staging** に向け、
  `NEXT_PUBLIC_DEV_LOGIN_EMAIL` / `NEXT_PUBLIC_DEV_LOGIN_PASSWORD` を置く
  （`.env.local` は本番を向いているので、上書きするこのファイルで staging に寄せる）。
- モバイル幅の見た目は Playwright で撮る（ブラウザのウィンドウをリサイズしても
  ビューポートが変わらないことがある）。`devices["iPhone 15 Pro"]` で開いて
  開発用ログインを押してから目的のページへ、という流れ。

## web の動作確認は staging（Vercel Preview）で行う

環境（本番/確認用で DB が分かれていること・全体像）は
[`architecture.md`](./architecture.md) の「環境（本番／確認）」節を参照。

**`main` に入れたものは即公開されるので、確認は staging で行う**
（`main` に入る ＝ 公開）。

- **`main` へは PR からだけ入れる。** CI（`.github/workflows/ci.yml`）と Vercel のビルドが
  通り、main の最新を取り込んだ状態であることがマージの条件（ブランチ保護。管理者にも効く
  ので、手元から `main` へ直接 push すると弾かれる）。手元のフックは手元の `node_modules`
  で走るので、まっさらな環境から入れ直す CI でしか出ない壊れ方がある。
- **「main の最新を取り込んだ状態」を条件にしているのは、組み合わせを確かめずに本番へ
  入れないため。** 2本の PR がそれぞれ古い main の上では CI を通っていても、両方入ると
  壊れることがある（片方が関数の名前を変え、もう片方がその名前で呼ぶ等）。この条件が無いと
  それに気付くのはマージ後の main の CI で、main はそのまま本番なので、その時には公開されて
  いる。GitHub の既定ではオフで、付けると1本入るたびに残りの PR が止まる。その手当てが
  Renovate の作り直しと、下の取り込みのワークフロー（本来はマージキューの役目）。
- **入れてよい PR には自動マージを掛ける**（`gh pr merge --auto --squash`）。先に別の PR が
  入って古くなっても、`.github/workflows/update-pr-branches.yml` が最新の main を取り込ませ
  （merge。手元のブランチは pull で追いつける）、CI が通り直せば入る。マージキューの代わり
  （個人のリポジトリでは使えない）。Renovate の PR は Renovate が自分で作り直すので対象外。

- **確認はプレビュー URL で行う。** `https://triplot-git-staging-hdtks-projects.vercel.app`
  （Vercel Authentication が有効＝Vercel にログイン済みのチームメンバーだけが
  開ける）。ブランチ固定 URL なので Google OAuth に登録できている。
- **`main` へのマージは確認が済んでから。** これが本番公開そのもの。
- **migration を入れたら staging にも当てる**（下記「staging DB への migration」）。

```
feature ブランチ → staging にマージ → プレビュー URL で確認 → main への PR → CI が通ったらマージ → 本番
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

### Apple Sign In は staging Supabase で無効

Supabase Auth の Apple プロバイダは**本番プロジェクトのみ有効化**されている
（Dashboard の Authentication → Providers、`external_apple_enabled` は
本番 `true` / staging `false`）。staging（Vercel Preview・iOS の preview
ビルドとも staging Supabase を向く）で Apple ボタンを押すと
`AuthApiError: Provider (issuer "https://appleid.apple.com") is not enabled`
になる。**Google ログインで代替できるので確認は Google で行う**（Apple 固有の
確認がどうしても要るときだけ TestFlight／本番相当の環境で見る）。

### メールとパスワードでのログインは staging だけ有効

Supabase Auth の Email プロバイダは**staging だけ有効**で、本番では切ってある。
利用者の入口は Google と Apple だけで、メールとパスワードを使うのは開発用ログイン
（web・iOS）と実 DB のテストだけ。どれも staging に向く。

画面にボタンが無くても、プロバイダが有効ならログインの窓口は開いている（窓口の場所と
anon key はアプリにも web にも入っている）。本番のアカウントにパスワードを付けると
そこから入れてしまうので、**本番ではプロバイダを有効にしない・パスワードを付けない**。

### staging DB への migration

```bash
npm run db:push:staging   # scripts/db-push-staging.sh
```

接続文字列は gitignore された `apps/web/.env.staging.local` の
`SUPABASE_STAGING_DB_URL` から読む。本番は `supabase link` 済みプロジェクトを
見る従来どおりの経路で、**link を張り替えない**（どちらを触っているかが
コマンドから自明であること優先）。

`database.generated.ts` の生成元は本番のまま（`npm run db:types`）。staging と
本番でスキーマが揃っている前提なので、**migration を入れたら両方に当てる**こと。

## Cloudflare の Worker を出す

メールの受け口（`workers/inbound-email`）と、取り込みの再試行を毎分呼ぶ心拍
（`workers/retry-heartbeat`）は Cloudflare で動く。どちらも1本で本番と staging の
両方を受け持つので、**出した瞬間に本番に効く**。main への push では出ない。

```bash
npm run workers:deploy -- inbound-email --dry-run   # 送らずに、何が出るかだけ見る
npm run workers:deploy -- inbound-email
```

- 初回だけ `npx wrangler login`（ブラウザで Cloudflare に許可する）。
- 名前・平文の変数・cron は各 Worker の `wrangler.jsonc` が原本。**ダッシュボードで
  平文の変数を足さない** —— ファイルに無いものは次に出した時に消える。
- 秘密の値は Cloudflare 側にだけ置き、出しても消えない。入れ替えは
  `npx wrangler secret put <名前> --config workers/<名前>/wrangler.jsonc`。
- どのアドレスを受け口に向けるか（Email Routing の規則）はゾーンの設定で、
  ダッシュボードの triplot.app → Email Routing にある。

## iOS の実機確認: シミュレータ → preview ビルド → TestFlight

環境（本番/確認用で DB が分かれていること・bundle id・全体像）は
[`architecture.md`](./architecture.md) の「環境（本番／確認）」節を参照。
ここには具体的なコマンドと **どの段を使うかの判断**を書く。

3段階で確認レベルが上がる。**番号が小さいほど既定＝まずここを使う。**
大きい段へ進めるのは、その必要が明確にある時だけ。

1. **シミュレータ＋maestro**（一番速い。実機固有の挙動は見れない — 開発ビルド
   限定の要素が実機と違う挙動をする。例: expo-dev-client の Tools ボタンが
   画面右上のタップを吸う）。まずここで動作を作り込む。**staging DB を見る**
   （下記「シミュレータの向き先」）ので、書き込みを伴う確認もここでしてよい。
2. **preview ビルド**（実機・staging DB・TestFlight/App Store Connect を
   一切通らないので数十秒でインストールできる）。**「実機で見たい」の既定は
   ここ。** 一段落する前の軽い確認・繰り返しの検証・出先でスマホだけの時に使う。
   TestFlight を毎回のビルド先にしない（Apple の処理待ち5〜10分＋本番 DB を
   見に行くので、小さな確認の往復には重すぎる）。
3. **TestFlight**（本番 DB・Apple の処理待ちあり・市場公開に一番近い確認）。
   **区切りのタイミングでだけ**使う。「区切り」＝ 2. の preview ビルドで一通り
   確認できていて、機能追加やバグ修正のまとまりが完成し typecheck / lint /
   テストが通っている状態（＝ preview を経ずに TestFlight へ飛ばない）。

### 1. シミュレータの向き先

シミュレータの開発ビルドがどの DB を見るかは、gitignore された
`apps/mobile/.env.local` の `EXPO_PUBLIC_SUPABASE_URL` /
`EXPO_PUBLIC_SUPABASE_ANON_KEY` で決まる。**staging に向けておく**（開発用ログイン
`EXPO_PUBLIC_DEV_LOGIN_*` も web の `.env.development.local` と同じ staging の資格情報）。

**起動時に環境変数を渡しても向き先は変わらない。** Expo の開発用バンドルは、
シェルの環境変数の上に `.env` 系のファイルの値を重ねてアプリに渡す
（`expo/virtual/env`）。ファイルに値がある限りそちらが勝つので、変えるならファイルを
書き換える。

本番のビルド（EAS の preview / production）はこのファイルを使わない。EAS は git の
管理下にあるファイルだけを持ち込み、向き先は EAS の environment の値で決まる。

### 2. preview ビルド

- **`eas.json` の `preview` プロファイル**（`distribution: "internal"`,
  `environment: "preview"`）を使う。**production プロファイルとは別物**:
  bundle identifier が `app.triplot.mobile.staging`（本番アプリと同じ端末に
  共存できる）、EAS の `preview` environment には **staging の Supabase**
  （`xuytnpkvmiduffigimol`）の URL/anon key を登録済み（他の Google 系キーは
  production と共通）。
- 初回だけ要る準備（済んでいれば省略可）: 実機の UDID 登録
  （`npx eas-cli device:create` → Website 方式 → 表示された URL を実機の
  Safari で開いてプロファイルをインストール）と、実機の
  設定 → プライバシーとセキュリティ → デベロッパモード を ON。
- ビルド → アップロード → インストールリンク発行:

  ```bash
  npm run ios:build -- preview
  npm run ios:preview:upload -- apps/mobile/build-<timestamp>.ipa
  ```

  ビルドは TestFlight 用と同じ `ios:build` を通す（ログを全文残す・できた ipa を検める・
  Expo の部品の知らせを出す。下の「TestFlight」と「依存の更新」）。

  最後に出る `itms-services://...` リンクを実機の **Safari** で開くと
  インストールできる（他アプリ内ブラウザやカスタムスキーム非対応アプリからの
  タップは失敗する）。アップロード先は Vercel Blob（`triplot-ios-preview`
  ストア、public access）。トークンは repo ルートの `.env.local` の
  `BLOB_READ_WRITE_TOKEN`（`vercel blob create-store` 実行時に自動で書き込まれた
  値。スクリプトが `BLOB_READ_WRITE_TOKEN` 未設定ならこのファイルから自動で
  拾うので、都度 export しなくてよい）。

### 3. TestFlight

- **TestFlight 用（動作確認用）のビルドはローカルビルドにする。** EAS のビルド枠
  が余っていてもローカルを使い、枠は本番用に温存する。

  ```bash
  npm run ios:build
  npm run ios:submit -- apps/mobile/build-<timestamp>.ipa
  ```

  **`eas-cli` を直に叩かない。** ログの全文を残すことと、できた ipa を検める
  ことを、この2つのコマンドが持っている。

- **本番（市場リリース）用のビルドはクラウドビルドにする**（`--local` を付けない）。
  ローカルビルドは Mac の状態（Xcode の版・キーチェーン・node_modules への
  パッチ適用）に結果が左右されるので、公開するバイナリはクリーンな環境で作る。
- `eas submit` は App Store Connect へのアップロードまで。公開には App Store
  Connect で別途バージョンを作って審査に出す操作が要るので、submit しただけで
  市場に出ることはない。ビルド番号は `eas.json` の `autoIncrement` が自動で
  上げる（バージョン文字列だけは `app.config.ts` の `version` を手で上げる）。

### pod install が cmake で落ちる時

`pod install` が `cmake` を要求して落ちたら、**上流のアーティファクト配信が
落ちている合図**（Hermes と React Native 本体はビルド済みの tarball を落として
使うので、普段 `cmake` は要らない）。**回避せず待つ** —— Hermes だけキャッシュで
塞ぐと React Native 本体はソースからビルドされ、**ビルドは成功するのに起動しない**
アプリができる（実際に 0.1.0 (210) を出してしまった）。配信の生死は `ios:build` が
失敗した時に自分で見に行く。

ローカルビルドには Xcode 26.3 以上 / fastlane / login キーチェーンに Apple WWDR
G3 中間証明書が要る。`patches/` のパッチは root の postinstall で自動適用される。
パッチを当てた部品の版が lockfile の作り直し等で上がると、当たらずに `npm ci` ごと落ちる
（CI で止まる）。上流で直っていればパッチを消し、まだ要るなら新しい版で作り直す。

## 依存の更新（Renovate）

依存の新しい版は Renovate（GitHub アプリ）が PR にして持ってくる（設定は `renovate.json5`）。
**CI が通れば自動でマージされる。人が見るのはメジャーと、Expo の新しい SDK だけ**。

| 種類 | PR の出方 | ラベル | 扱い |
|---|---|---|---|
| 開発用の依存（lint・型・テストの道具。npm 自体も）のパッチ・マイナー | 毎週、まとめて1本 | 自動マージ | 自動 |
| iOS でだけ使う依存のパッチ・マイナー（Expo の部品を除く） | 毎週、まとめて1本 | 自動マージ | 自動 |
| web の本番の依存のパッチ・マイナー | 毎週、まとめて1本 | 自動マージ | 自動 |
| GitHub Actions の部品（メジャーも） | 毎週、まとめて1本 | 自動マージ | 自動 |
| lockfile の作り直し（間接の依存を範囲内の最新にする） | 毎週 | 自動マージ | 自動 |
| セキュリティの修正（メジャーを含む。上のどの種類の依存でも） | 見つかった時にすぐ | セキュリティ・自動マージ | 自動 |
| メジャー | Dependency Dashboard で承認すると1件ずつ | 要検討：メジャー | 移行の手順を読み、コードを直してから入れる |
| Expo の新しい SDK | 来ない | — | iOS のビルドが知らせる。下の「Expo の部品」 |

- **「CI が通った＝壊れていない」とみなして入れる。** 今の CI は lint・型・単体テストと
  Expo の部品の組み合わせまでで、画面の動作と iOS のビルドは見ていない。利用者が少ない今は、
  壊れたらすぐ直す・戻す方を取り、守りは後から足す（Issue #54）。
- **メジャーだけは人が入れる。** 互換を壊す変更が前提なので、コードを直さないと入らないか、
  CI が落ちないまま設定の既定値や挙動だけが変わる。どちらも移行の手順を読む作業が要る。
- **セキュリティの修正はメジャーでも自動で入る。** Renovate はセキュリティの修正の設定
  （`vulnerabilityAlerts`）を他の規則の後に強制で当てるので、メジャーかどうかで分けられない。
  それでも困らないのは、Renovate が選ぶのは穴が直った版のうち一番低いもので、修正は普通
  今のメジャーの中にも出るから。メジャーになるのは今のメジャーの保守が切れた時だけで、
  メジャーの PR を追いかけていればまず起きない。
- **毎週、小さく入れる。** 1回に動く量が少ないほど、壊れた時に原因を絞りやすい。
- **グループのブランチ名は `groupSlug` で英語にしておく。** Renovate はブランチ名を
  `groupName` から作り、日本語は落とす。全部落ちるとブランチ名が `renovate` だけになり、
  作れずにエラーになる。
- **公開から7日経った版だけを取る**（`minimumReleaseAge`）。乗っ取られたアカウントから出た
  悪意のある版は、たいてい数日で見つかって取り下げられる。セキュリティの修正には効かない。
- **自動マージの条件**は main のブランチ保護が持つ: CI（`.github/workflows/ci.yml`）と
  Vercel のビルドが通り、main の最新を取り込んだ状態であること。1本入って残りの PR の土台が
  古くなると、Renovate が新しい main の上に作り直してチェックし直すので、**入れる順番は
  気にしなくてよい**。自分の変更も同じ条件で PR から入る（上の「web の動作確認は staging で行う」）。
- **Dependabot ではなく Renovate を使うのはこのため。** Dependabot は衝突しない限り古くなった
  だけの PR を作り直さず、作り直しの依頼（`@dependabot rebase`）も人からしか受け付けない
  ので、自動マージ待ちの PR が1本入るたびに残りが緑のまま止まった。
- **メジャーは、Renovate が立てる Issue「Dependency Dashboard」に載るだけで、PR は作らない**
  （`dependencyDashboardApproval`）。取り掛かると決めたら、その Issue の「Pending Approval」の
  行にチェックを入れると、Renovate が次に動いた時にその版の最新で PR を作る。手を付けるまで
  PR を開いておくと、main が動くたびに作り直されてビルドが落ち続ける（コードを直さないと
  通らないため）。メジャーの残件はこの Issue が持つ（1件ずつの残件の Issue は立てない）。セキュリティの
  修正は、メジャーでも承認を待たずに PR になる。
- **間接の依存のセキュリティの修正は、毎週の lockfile の作り直しで入る。** Renovate が
  見つかった時にすぐ PR にするのは、直接の依存の修正だけ。
- **npm の版は `package.json` の `packageManager` で決める。** Renovate はこれを読んで同じ版で
  lockfile を作り、CI もこの版を入れてから動く。新しい版は開発用の依存のまとめに入って自動で
  上がるので、手元の npm もそれに合わせて上げる（`npm install -g npm@<版>`）。
- **ルートの `.npmrc` の `allow-remote=all` は npm 12 の不具合の回避。** lockfile の無い状態から
  作り直すと失敗する（npm/cli#9800）。外れるのは「レジストリの外（URL・git）から部品を取らせない」
  という npm 12 で増えた防御で、npm 11 までと同じ扱いになる。直ったら消す。
- **npm 12 は依存の install スクリプトを、`package.json` の `allowScripts` で許したものしか
  走らせない。** 今止めているもの（`false`）は、ビルド済みのバイナリを同梱していてスクリプトが
  要らないもの。新しく止められたら `npm install-scripts ls` に出るので、要るものだけ
  `npm install-scripts approve <名前>` で許す。

### 部品の更新と自分の変更を混ぜない

壊れた時に、部品の更新と自分の変更（機能追加・不具合修正・リファクタリング）のどちらが原因かを
切り分けられるようにしておく。時期をずらすのではなく、**変更の単位を分けて**切り分ける。

- **1つずつ別の PR にし、main でも別のコミットにする。** 部品の更新は Renovate の PR、自分の
  変更は自分の PR。時期が重なっても main の上では1つずつ並び、web は1つずつ本番に出る。
  自分の PR の中で部品を上げない（`npx expo install --fix` も別の PR にする）。
- **入れる前に、最新の main の上で確かめ直す。** ブランチ保護が main の最新を取り込んだ状態を
  マージの条件にしているので、先に入った部品の更新との組み合わせで CI が回る。
- **壊れたら履歴を辿る。** 壊れる前と後のコミットの間を二分探索で絞る（`git bisect`）。web は
  Vercel の前のデプロイに戻して確かめられる。原因のコミットだけを取り消す。
- **作業中のブランチに main を取り込むのは、要る時だけ。** 取り込むと手元の部品が変わる。
  取り込んだ後に様子が変わったら、まずその間に部品の更新が入ったかを履歴で見る。

### Expo の部品

**Expo の SDK に版が縛られている部品は、Renovate に PR を作らせない**（expo 本体・expo-*・React・
React Native とその周りの部品）。Expo は SDK ごとに「動作を確かめた版の組み合わせ」を持って
いて、外れると iOS のビルドが通らない・起動しない等の壊れ方をすることがある。その組み合わせは
部品の設定ファイルではなく Expo 自身の一覧にあり、npm も Renovate も読めない。読めるのは
Expo のコマンドだけなので、版を選ぶのはそちらに任せる。

**外す部品は「Expo の一覧」＋「名前」＋「足す」−「引く」で決める**（`renovate.json5` の
Expo の規則。欄ごとにコメントで区切ってある）。

| 欄 | 中身 | 決め方 |
|---|---|---|
| Expo の一覧 | expo の `bundledNativeModules.json` に載っている依存と expo 本体 | 手で選ばない。書くべき一覧は `npm run check:renovate-expo -- --print` |
| 名前 | `expo-*`・`@expo/*` | Expo 向けの部品は SDK に縛られていることが多いので、名前で先に外す |
| 足す | 上の2つに当たらないが、SDK に縛られている部品 | 見つけたら1行足し、理由と見つけた日をコメントに書く |
| 引く（先頭に `!`） | 名前で外れたが、SDK に縛られていない部品 | 同上 |

- **Expo の一覧だけでは足りない。** Expo の一覧は Expo が自分で確かめた部品だけの一覧で、Expo に
  縛られた部品の全部ではない。外部の人が作った部品にも、求める expo の版を SDK 1つに閉じて
  宣言しているものがある（例: 共有を受け取る `expo-share-intent`。8 系は SDK 57 だけ、9 系は
  SDK 58 だけ）。これを普通の依存として扱うと、SDK を上げない限り入らないメジャーが
  Dashboard の承認待ちに並び、承認すれば上がるように見える。Renovate も Expo のコマンドも
  この縛りを見ない（Renovate の保守者も、peerDependencies を見て候補を絞る機能は無いと
  している）ので、自分たちで見る。
- **書き方は gitignore に似ているが、順番は関係ない。** どれかに当たり、`!` のどれにも当たら
  なければ外れる（Renovate の名前の指定の決まり）。
- **外し忘れ・引き違いは `npm run check:renovate-expo`（pre-push と CI）が止める。** Expo の一覧の
  欄のずれ、SDK に縛られている（求める expo の版がメジャー1つに閉じている）のにどこからも
  外れていない部品、引けない部品（Expo の一覧のもの・SDK に縛られたもの）を引いている、
  もう依存に無い名前が足す・引くに残っている、を見る。
- **名前・足すで外した部品は、誰も新しいメジャーを持ってこない**（Renovate は外しているし、
  Expo のコマンドは知らない）。SDK に縛られた部品なら、SDK を上げる時にインストールが
  止まるので、そこで一緒に上げる。縛られていないのに名前で外れていた場合に取り残されないよう、
  `npm run ios:build` の最後の知らせに新しいメジャーを出す（下の表）。

部品の版の動き方と見張り:

- **SDK の中の範囲での更新は、毎週の lockfile の作り直しで入る。** アプリの `package.json` の
  範囲（`~57.0.8` 等）は Expo が決めたものなので、その中で上がるのは Expo の組み合わせの内側。
- **組み合わせから外れていないかは CI が見る**（`npm run check:expo-deps`。pre-push と CI）。
  入っている expo 本体が持つ一覧と比べ、Expo のサーバーには問い合わせない（`EXPO_OFFLINE=1`）。
  問い合わせると、Expo が新しいパッチを出した日に、リポジトリが何も変わっていなくても落ちる。
- **expo 本体と、範囲の外に出る更新（版を固定している react-native 等）は、週1回の
  ワークフローが揃える**（`.github/workflows/expo-sdk-patch.yml`。月曜の朝）。
  `npx expo install --fix` を回し、変わった時だけ PR を出して自動マージを掛ける。CI が通れば入る。
  急ぐ時は Actions の画面から手で動かせる。Expo が版を決めているアプリの開発用の依存
  （`typescript`・`@types/react`）もこれが揃えるので、Renovate は `apps/mobile` のそれには触らない。
  - Expo の組み合わせは Expo 自身が確かめて出すものなので、このワークフローは公開から
    7日待たずに取り込む。
  - PR は GitHub App（`triplot-deps-bot`）の鍵で作る。Actions に付いてくる鍵で作った PR では
    CI が動かず、マージの条件を満たせないため。鍵は Actions の変数 `DEPS_BOT_CLIENT_ID` と
    シークレット `DEPS_BOT_PRIVATE_KEY`。
- **新しい SDK は人が判断する。** `npm run ios:build` が最後に知らせを出す（preview・TestFlight の
  どちらでも。止めはしない）:

| 知らせ | 大きさ | どうするか |
|---|---|---|
| 今の SDK の中の更新がある | パッチ相当 | 週1回のワークフローが揃える。急ぐなら手で動かす |
| 新しい SDK が出ている | メジャー相当 | 上げるかどうか・いつ上げるかを吟味して決める。Expo のアップグレードの手順に従い、別の PR にする |
| Renovate から外していて Expo のコマンドも揃えない部品に、新しいメジャーがある | メジャー | SDK に縛られているなら SDK を上げる時に一緒に上げる。縛られていないなら「引く」に書いて Renovate に戻す |

expo と Expo の部品は、アプリの `package.json`（`apps/mobile`）にだけ書く（Expo の monorepo の
手順と同じ）。ルートには置かない。

## バージョン表記

web・iOS・（将来）Android のバージョン番号のルール（それぞれ独立運用・
git tag は使わない・リリース手順）は [`versioning.md`](./versioning.md) を参照。
