// 採点した回を並べる。
//
// 使い方: npm run eval:import:compare -- <名前> <名前> ...

import { readEval } from "./lib.mjs";

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error("使い方: npm run eval:import:compare -- <名前> <名前> ...");
  process.exit(1);
}

const rows = names.map((n) => readEval(`score-${n}.json`));
const head = ["回", "モデル", "費用（対応/出し過ぎ/取りこぼし）", "予定（対応/出し過ぎ/取りこぼし）", "予定の開始", "合体", "費用"];
console.log(`| ${head.join(" | ")} |`);
console.log(`|${head.map(() => "---").join("|")}|`);
for (const r of rows) {
  const e = r.expenses;
  const v = r.events;
  console.log(
    `| ${[
      r.name,
      r.models.map((m) => m.replace(/^[^/]+\//, "")).join(", "),
      `${e.matched}/${e.extra.length}/${e.missed.length}（正解 ${e.truth}）`,
      `${v.matched}/${v.extra.length}/${v.missed.length}（正解 ${v.truth}）`,
      `${v.fields.start}/${v.fields.n}`,
      r.merged,
      `$${r.cost.toFixed(2)}`,
    ].join(" | ")} |`,
  );
}
