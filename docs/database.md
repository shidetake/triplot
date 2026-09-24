# データベース

DB（Supabase の Postgres）の設計と、読み書きの決まり。スキーマの実体は
`supabase/migrations/`。

## DB モデル

- **`trips.id` は 10 文字 base62 の nanoid（text）で、uuid ではない。** URL に出るため。他のテーブルの主キーは uuid。生成は `public.nanoid(size)` SQL 関数。`create_trip` RPC が衝突時にリトライする。
- **「trip のオーナー」カラムは存在しない。** 権限の根拠は `trip_members`（`trips` × `users` の M:N）への参加だけ。`left_at` でソフト退会。「アクティブメンバー」= `left_at IS NULL`。
- **`visibility = 'shared' | 'private'`** が `places` / `events` / `expenses` のアクセス制御の軸。shared は trip のアクティブメンバー全員に見え、private は作成者のみ。アプリ層ではなく **RLS** で守られている。
- **多通貨対応:** `expenses` は `(local_price, local_currency, rate_to_default)` を per-row で持つ。default_currency 換算値はアプリ側で `local_price × rate_to_default`。デフォルトのレートは「同 trip 内、同通貨の既存 expense の `rate_to_default` の単純平均」を UI 側で算出（履歴が無ければユーザ入力）。trip-level の為替レートテーブルは存在しない。
- **カテゴリ:** `expense_categories` テーブルが trip ごとにカテゴリを持つ。trip 作成時に 11 個（渡航/現地移動/飲食/衣服/エンタメ/土産/宿泊/通信/医療/カジノ/その他）を `seed_default_expense_categories` で seed する。`expenses.category_id` は NOT NULL + `on delete restrict`。
- `expenses` には CHECK 制約: `private` の費用は `splittable = false` でなければならない（private は割り勘不可）。
- **地図の表示範囲は「ピンが集まっているところ」だけに合わせる。** 全ピンの外接矩形を使うと、離れた1点（帰りの空港など）に引っ張られて海の上が中心になる。`clusterPlaces` → `dominantCluster` で主役エリアを選ぶ。中心は必ず `centerOf()` を使い `(west+east)/2` を自前で書かない（日付変更線を跨ぐ bounds は `west > east` で返るため、自前計算だと地球の反対側が中心になる）。詳細は [design/place-map.md](./design/place-map.md)。
- **予定の TZ は保存しない。** 通常・終日の `events.start_tz` / `end_tz` は常に NULL で、literal な TZ を持つのは `kind='transit'` だけ（旅行の TZ 境界の唯一の真実源）。通常の予定の実効 TZ は旅程から毎回導出する（`resolveEventTz`）。`start_at` / `end_at` は壁時計（`timestamp without time zone`）。**「全予定に TZ を埋める」方式に変えないこと** — 理由と代償は [design/timezone.md](./design/timezone.md) の 0 節。
- **利用枠（メール取り込みの月間上限）は残高ではなく計測。** 使用量は保存せず、その月の抽出済み件数を都度数えて上限と比べる（`monthlyExtractCount`）。**月初に枠を復活させるバッチは無いし、作らない**（全ユーザが枠を失う単一障害点になる・カウンタと実データがずれる）。プランと個別上書き・古参優遇の扱いは [design/billing.md](./design/billing.md)。

## データを誰に読ませるか

判断は「**管理者は読めるべきか**」の1問でする。

- **読めるべき**（運営のための集計・記録など）→ RLS に「管理者なら読める」
  （`is_app_admin()`）のポリシーを付ける。管理ページは管理者のログインで読み、
  service role のクライアントは使わない。
- **読めるべきでない** → ポリシーを付けず、service role を持つプログラムだけが
  扱う。当てはまるのは次の3種類だけ。
  1. **見えると乗っ取りや覗き見に使える鍵そのもの** — 他人になりすまして
     ログインできる引換券など。管理者でも見えた時点で悪用できる。見えても
     迷惑にしかならない値（例: メール取り込みの転送先トークン。知られても
     受信箱に不要な下書きが増えるだけで、中身は読まれない）はこれに当たらない。
  2. **他のユーザーの私的な中身** — 非公開の予定や転送されたメールの本文など。
     管理者だからといって覗けるべきではない。
  3. **システム内部の作業用メモ** — 実行中の目印や外部問い合わせの一時保存。
     見せる害は小さいが、人が見る意味が無い。

service role は RLS を素通りして全部のデータを読み書きできる。ログインした人が
始めた処理（管理ページの表示を含む）では使わず、**人が始めたのではない処理**
（Cron・外から届くメールの受け口・フライト照会の中継など）でだけ使う。
強すぎる鍵なので、使う場所が少ないほど、バグや漏洩の被害が小さく済む。

## RLS のパターン

- `SECURITY DEFINER` の SQL ヘルパーが 2 つ — `is_active_trip_member(trip_id)` と `is_own_member(member_id)` — をポリシーから呼んでいる。`SECURITY DEFINER` なのは意図的で、`trip_members` を参照するときに同じテーブルの RLS が再帰評価されるのを避けるため。
- trip 紐づきテーブルに新しくポリシーを書くときは既存パターンに従うこと: `(visibility = 'shared' AND is_active_trip_member(trip_id)) OR (visibility = 'private' AND is_own_member(created_by_member_id))`。

## 複数行書き込みは `SECURITY DEFINER` RPC で

- `create_trip(...)` が `trip` + 作成者の `trip_member` + デフォルトカテゴリを 1 トランザクションで insert する。RLS をバイパスし、関数の入口で `auth.uid()` を自前チェック。
- `create_expense(...)` が `expenses` + `expense_splits`（splittable のとき）を atomic に insert。category と payer が同 trip の有効値かも関数内で検証。
- 1 つのユーザ操作で RLS 配下の複数テーブルに atomic に書く必要があるときはこのパターンを使う。クライアント側で insert を連鎖させようとしないこと — RLS の評価順や部分失敗のリカバリで詰む。

## DB 型定義

- **`packages/shared/src/types/database.generated.ts`** が単一の真実。`npm run db:types` で実 DB から自動生成する（`apps/web/.env.local` の `SUPABASE_ACCESS_TOKEN` を使う）。**手で編集しない。**
- `packages/shared/src/types/database.ts` は生成物の re-export + 利便用の union 別名（`Currency` など）だけ。生成型は CHECK 制約を読めず通貨等が `string` になるので、DB 境界（fetch 結果の map、RPC 呼び出し）で `as Currency` 等に絞る。
- gen-types は DEFAULT 無しの nullable 関数引数を `string` にしてしまう既知の癖がある（`create_trip` の `p_start_date` 等）。その箇所だけ呼び出し側でキャスト。
- migration を変えたら **必ず `npm run db:types` を実行して再生成し、コミットに含める**。

## Migration ポリシー

サービスは公開済みで、本番 DB には利用者の本物のデータが入っている。
**ユーザーのデータは壊さない。**

- **本番のデータは原則書き換えない・消さない。** 直接の SQL や手作業での修正も
  含む。どうしても必要な時だけ、ほかに手段が無いことを確かめてから行う。
- **データを消して済ませない。** `truncate`・DB の作り直し・手動の削除で
  スキーマ変更の辻褄を合わせない。
- **既存データを新しい形に合わせる必要があれば、移行処理（backfill）を
  migration に書く。** 列を足して既存行を埋める、形式を変えて書き換える、など。
- **適用済みの migration ファイルは書き換えない。** 変更は必ず新しい migration
  ファイルで足す。書き換えても本番には反映されず、ファイルと実 DB がずれる。
- **配布済みのアプリを壊さない。** iOS アプリは古い版が利用者の端末に残り続ける。
  また web でも、DB への反映とアプリのデプロイの間にずれる時間がある。
  - RPC に引数を足すときは既定値を付け、古い呼び方でも動くようにする。
  - 関数・列・テーブルを消すときは段階を踏む。まず使わないアプリを出し、
    古い版が使われなくなってから消す。
