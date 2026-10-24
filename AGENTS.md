# AGENTS.md

このリポジトリで作業する AI エージェント向けのガイド（単一の真実）。
`CLAUDE.md` はこのファイルを読み込むだけで、中身は持たない。

**このファイルは AI エージェントだけが読む。** 人間も読むべき情報（設計の
決まり・判断の基準など）はここに書かず `docs/` に書き、ここからはリンクで
指す。ここに書いた内容は人間の目に入らない前提で扱う。

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 読むもの

人間と共有している文書。作業の前提として下で全部取り込む。

- [docs/development.md](docs/development.md) — 開発の手順・コマンド・コードの仕組み・確認環境
- [docs/database.md](docs/database.md) — DB の設計と読み書きの決まり
- [docs/ui-guidelines.md](docs/ui-guidelines.md) — 見た目とインタラクションの規約
- [docs/architecture.md](docs/architecture.md) — システム全体の構成（取り込みはしない。必要な時に読む）

残件（これからやること）は GitHub の Issue で持つ（`gh issue list -R shidetake/triplot`）。
足すのも閉じるのも Issue で行い、リポジトリのファイルに残件の一覧を作らない。PR で片付く
ものは、PR の本文に `closes #番号` を書いてマージで閉じる。

## 自分の判断で進めてよいこと・いけないこと

- **web**: 画面に見える変更が一段落し typecheck / lint / テストが通ったら、
  指示を待たず `staging` にマージして push する（確認できる場所まで自分で運ぶ）。
  **画面に見える変更は、ユーザーの指示なしに `main` へ入れない**（`main` に入る ＝ 本番公開。
  staging で見てもらってから）。ユーザーの「push していい」「main に入れていい」がその許可。
- **画面に見えない変更**（docs・スクリプト・設定・不要なファイルの削除など、頼まれた作業の
  行き先が `main` のもの）は、PR を作って自動マージを掛けるところまで、許可を待たずに進める
  （`gh pr merge --auto --squash`。CI が通れば入る）。マージしてよいかを聞き返さない。
- `main` へは必ず PR から入れる（ブランチ保護が管理者にも効いていて、直接の push は弾かれる）。
- **iOS**: 「実機で見たい」と言われたら preview ビルドを使う。区切り
  （docs/development.md の「iOS の実機確認」の定義）では、指示を待たず
  TestFlight にビルドして submit まで進める。
- **本番のデータは原則書き換えない・消さない。** スキーマの変更は migration を
  通す。調査のための読み取りはよい。自分が検証用に作ったものでも、本番では
  書き換え・削除をしない（検証は staging で行う）。どうしても本番のデータを
  書き換える必要がある時だけ、理由を説明してユーザーの許可を得てから行う。

## ユーザーへの渡し方

- preview ビルドの `itms-services://...` リンクは、**マークダウンのコードブロック
  （```）で囲んで**渡す。QR コードは作らない（チャットに URL を貼れば済み、QR は
  画像を送る一手間が増えるだけ）。コードブロックにするのは、リンクとして装飾
  されるとタップ・コピーしにくく崩れることがあるため。「実機の **Safari** で
  開いてください」と添える。

@docs/development.md

@docs/database.md

@docs/ui-guidelines.md
