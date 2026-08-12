// 本番(production)で表示する web のセマンティックバージョンを書き出す。
//
//   node scripts/gen-web-version.mjs 0.2.0
//
// このリポジトリは web/iOS/Android を1つの monorepo で持ち、それぞれ独立した
// バージョン番号で運用する（各プラットフォームのリリースサイクルが違うため。
// 3つを同じ番号に揃えようとしない）。web だけ git tag（v0.2.0 等）を打つと、
// 将来 iOS/Android のリリースにもタグを付けたくなった時にタグ名が衝突する
// （どのプラットフォームの 0.2.0 か分からなくなる）。**このバージョン表示は
// git tag を一切必要としない**（getVersion() はこの生成ファイルの中身を
// そのまま読むだけ）ので、tag は打たない。リリースの特定は
// `git log -- apps/web/lib/version.generated.ts` で辿れば足りる。
//
// Vercel のビルド環境は shallow clone（浅い履歴取得）のことがあり、仮に
// ビルド中に `git describe` でタグを解決しようとしても tag 履歴が無くて
// 失敗し得る、という理由もあり値は常にローカルで確定させる
// （db:types 等と同じ「ローカルで生成してコミット」パターン）。
//
// リリース手順:
//   1. staging を main にマージする
//   2. node scripts/gen-web-version.mjs <新バージョン> を実行してコミット・push

import { writeFileSync } from "node:fs";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Usage: node scripts/gen-web-version.mjs <X.Y.Z>");
  process.exit(1);
}

const OUT = new URL("../apps/web/lib/version.generated.ts", import.meta.url);
const body = `// 生成ファイル。手で編集しない。
// node scripts/gen-web-version.mjs <X.Y.Z> で再生成する（release 手順は
// スクリプト本体のコメント参照）。

export const RELEASE_VERSION = "${version}";
`;

writeFileSync(OUT, body);
console.log(`Wrote RELEASE_VERSION = "${version}" to ${OUT.pathname}`);
