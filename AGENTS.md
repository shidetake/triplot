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

## 自分の判断で進めてよいこと・いけないこと

- **web**: 画面に見える変更が一段落し typecheck / lint / テストが通ったら、
  指示を待たず `staging` にマージして push する（確認できる場所まで自分で運ぶ）。
  **`main` へはユーザーの指示なしに入れない**（`main` への push ＝ 本番公開）。
- **iOS**: 「実機で見たい」と言われたら preview ビルドを使う。区切り
  （docs/development.md の「iOS の実機確認」の定義）では、指示を待たず
  TestFlight にビルドして submit まで進める。
- **Migration ポリシー**の「本番運用フェーズ」への切り替えは、ユーザーが明示的に
  言った時だけ。自分で判断しない。

## ユーザーへの渡し方

- preview ビルドの `itms-services://...` リンクは、**マークダウンのコードブロック
  （```）で囲んで**渡す。QR コードは作らない（チャットに URL を貼れば済み、QR は
  画像を送る一手間が増えるだけ）。コードブロックにするのは、リンクとして装飾
  されるとタップ・コピーしにくく崩れることがあるため。「実機の **Safari** で
  開いてください」と添える。

@docs/development.md

@docs/database.md

@docs/ui-guidelines.md
