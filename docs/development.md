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
これに下表の判定が乗る。

**規約を文書だけに置かない。** 手順として書けば、思い出した時にしか実行され
ない＝忘れた時に素通りする。機械が判定できるものはフックか、その操作を行う
コマンド自体に埋める。**下表のものは覚えなくてよい**（外すと止まる）。

| 守りたいこと | どこで止まるか |
|---|---|
| 転送先アドレス等をコミットする | `pre-commit`（`check:no-secrets`。値は環境ファイルから読み、ログには出さない） |
| `database.generated.ts` が実 DB とズレる | `pre-push`（`db:types:check`） |
| migration を staging に当て忘れる | `pre-push`（`check:staging-migrations`） |
| クライアント境界を越える import | `pre-push`（`check:client-boundary`） |
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

やることは2つ。**本番の受信箱を空にしてから、Gmail の指定ラベルのメールを
1通ずつ転送する**（まとめて1通にしない。1通=1レシートでないと取り込みの検証に
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
  知っていれば誰でもその受信箱にメールを流し込めるため）。
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
（`main` への push ＝ 公開）。

- **確認はプレビュー URL で行う。** `https://triplot-git-staging-hdtks-projects.vercel.app`
  （Vercel Authentication が有効＝Vercel にログイン済みのチームメンバーだけが
  開ける）。ブランチ固定 URL なので Google OAuth に登録できている。
- **`main` へのマージは確認が済んでから。** これが本番公開そのもの。
- **migration を入れたら staging にも当てる**（下記「staging DB への migration」）。

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

### Apple Sign In は staging Supabase で無効

Supabase Auth の Apple プロバイダは**本番プロジェクトのみ有効化**されている
（Dashboard の Authentication → Providers、`external_apple_enabled` は
本番 `true` / staging `false`）。staging（Vercel Preview・iOS の preview
ビルドとも staging Supabase を向く）で Apple ボタンを押すと
`AuthApiError: Provider (issuer "https://appleid.apple.com") is not enabled`
になる。**Google ログインで代替できるので確認は Google で行う**（Apple 固有の
確認がどうしても要るときだけ TestFlight／本番相当の環境で見る）。

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

## iOS の実機確認: シミュレータ → preview ビルド → TestFlight

環境（本番/確認用で DB が分かれていること・bundle id・全体像）は
[`architecture.md`](./architecture.md) の「環境（本番／確認）」節を参照。
ここには具体的なコマンドと **どの段を使うかの判断**を書く。

3段階で確認レベルが上がる。**番号が小さいほど既定＝まずここを使う。**
大きい段へ進めるのは、その必要が明確にある時だけ。

1. **シミュレータ＋maestro**（一番速い。実機固有の挙動は見れない — 開発ビルド
   限定の要素が実機と違う挙動をする。例: expo-dev-client の Tools ボタンが
   画面右上のタップを吸う）。まずここで動作を作り込む。
2. **preview ビルド**（実機・staging DB・TestFlight/App Store Connect を
   一切通らないので数十秒でインストールできる）。**「実機で見たい」の既定は
   ここ。** 一段落する前の軽い確認・繰り返しの検証・出先でスマホだけの時に使う。
   TestFlight を毎回のビルド先にしない（Apple の処理待ち5〜10分＋本番 DB を
   見に行くので、小さな確認の往復には重すぎる）。
3. **TestFlight**（本番 DB・Apple の処理待ちあり・市場公開に一番近い確認）。
   **区切りのタイミングでだけ**使う。「区切り」＝ 2. の preview ビルドで一通り
   確認できていて、機能追加やバグ修正のまとまりが完成し typecheck / lint /
   テストが通っている状態（＝ preview を経ずに TestFlight へ飛ばない）。

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
  cd apps/mobile
  npx eas-cli build --platform ios --profile preview --local --non-interactive \
    --output ./build/triplot-preview.ipa
  cd ..
  npm run ios:preview:upload -- apps/mobile/build/triplot-preview.ipa
  ```

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
G3 中間証明書が要る。`patches/` の expo-modules-jsi パッチ（Xcode 26.3 の Swift
で `abs` が曖昧になる上流バグ）は root の postinstall で自動適用される。

## バージョン表記

web・iOS・（将来）Android のバージョン番号のルール（それぞれ独立運用・
git tag は使わない・リリース手順）は [`versioning.md`](./versioning.md) を参照。
