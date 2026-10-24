#!/usr/bin/env node
// Renovate に触らせない「Expo の SDK に版が縛られている依存」の一覧が、実際の依存と
// 合っているかを確かめる（docs/development.md「Expo の部品」）。
//
// Expo の部品は Expo が SDK ごとに動作を確かめた版の組み合わせ（expo の
// bundledNativeModules.json）で揃える必要があり、Renovate はその組み合わせを
// 知らない。アプリに Expo の部品を足した時に除外を書き忘れると、Renovate が
// 組み合わせを崩す PR を出し、しかもそれは自動マージの対象になる。
//
// Expo の一覧に載らない外部の部品にも、求める expo の版を SDK 1つに閉じて宣言している
// ものがある（例: 共有を受け取る部品。8 系は SDK 57 だけ、9 系は SDK 58 だけ）。これを
// 外し忘れると、SDK を上げない限り入らないメジャーが Dashboard の承認待ちに並ぶ。
// Renovate も Expo のコマンドもこの縛りを見ないので、ここで見る。
//
// 書き忘れは画面で気付けないので、ここで止める。
//
//   npm run check:renovate-expo             # 一致を確かめる
//   npm run check:renovate-expo -- --print  # 「Expo の一覧」の欄に書くべき一覧を出す

import {
  dependencyNames,
  expoPeerRange,
  isSingleMajor,
  loadExpoExclusion,
} from "./renovate-expo.mjs";

const ex = loadExpoExclusion();
const deps = dependencyNames();
const expectedExpoList = [...new Set([...deps].filter(ex.inExpoList).concat("expo"))].sort();

if (process.argv.includes("--print")) {
  console.log(JSON.stringify(expectedExpoList, null, 2));
  process.exit(0);
}

const bound = [...deps].filter((n) => !ex.inExpoList(n) && isSingleMajor(expoPeerRange(n)));
const problems = [];
const say = (title, list, hint) => {
  if (list.length) problems.push(`  ${title}: ${list.join(", ")}`, `    → ${hint}`);
};

const listed = new Set(ex.expoListed);
say(
  "Expo の一覧の欄に無い",
  expectedExpoList.filter((n) => !listed.has(n)),
  "「Expo の一覧」の欄に足す（npm run check:renovate-expo -- --print）",
);
say(
  "Expo の一覧の欄に、もう依存に無いものがある",
  ex.expoListed.filter((n) => !expectedExpoList.includes(n)),
  "「Expo の一覧」の欄から消す",
);
say(
  "SDK に縛られているのに外れていない",
  bound.filter((n) => !ex.excludes(n)).map((n) => `${n}（expo ${expoPeerRange(n)}）`),
  "「足す」の欄に書く（引いていたなら「引く」から消す）",
);
say(
  "足す・引くの欄に、依存に無いものがある",
  [...ex.added, ...ex.negated].filter((n) => !deps.has(n)),
  "その行を消す",
);
say(
  "足す必要の無いものが足してある",
  ex.added.filter((n) => ex.matchesPattern(n)),
  "名前の形で既に外れているので、「足す」の欄から消す",
);
say(
  "引けないものが引いてある",
  ex.negated.filter((n) => ex.inExpoList(n) || bound.includes(n)),
  "Expo の一覧に載るものと SDK に縛られたものは引けない。「引く」の欄から消す",
);
say(
  "引く必要の無いものが引いてある",
  ex.negated.filter((n) => !ex.matchesPattern(n)),
  "名前の形で外れていないので、「引く」の欄から消す",
);

if (problems.length) {
  console.error("check-renovate-expo: Renovate の除外（renovate.json5）が実際の依存とずれている");
  for (const p of problems) console.error(p);
  process.exit(1);
}
const excluded = [...deps].filter(ex.excludes).length;
console.log(`check-renovate-expo: OK（外している依存 ${excluded} 個・うち SDK に縛られた外部の部品 ${bound.length} 個）`);
