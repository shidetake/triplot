// 取り込みの評価を1回流す（docs/import-eval.md）。
//
//   1. staging の評価用の旅行を「流す前の状態」に作り直す（prepare.mjs）
//   2. 受信箱を空にして、組のメールを全部転送する（test:seed-emails）
//   3. 取り込みが全部終わるまで待つ
//   4. 結果を ~/.triplot-eval/<名前>.json に書き出す
//   5. 画面に出る値に直し（derive.mts）、正解と突き合わせて採点する（score.mjs）
//
// どのモデルで取り込むかは staging の設定で決まる（Vercel の Preview の IMPORT_LLM_MODEL。
// 無ければコードの既定値）。採点の結果に、実際に呼ばれたモデルが出る。
//
// 使い方:
//   npm run eval:import -- --set hawaii --name hawaii-flash-r3
//   npm run eval:import -- --set hawaii --name hawaii-flash-r3 --since 2026-10-25T07:39:45Z
//     （転送まで済んでいる回の続きから。待つ・書き出す・採点だけ）

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { EVAL_DIR, ROOT, die, lit, loadSet, runStagingCli, stagingQuery, writeEval } from "./lib.mjs";
import { prepare } from "./prepare.mjs";
import { score, summary } from "./score.mjs";

const { values } = parseArgs({
  options: {
    set: { type: "string" },
    name: { type: "string" },
    since: { type: "string" },
    force: { type: "boolean", default: false },
  },
});
if (!values.set || !values.name) {
  die("使い方: npm run eval:import -- --set <組> --name <名前> [--since <ISO>] [--force]");
}
const set = loadSet(values.set);
const name = values.name;
if (!values.force && fs.existsSync(path.join(EVAL_DIR, `${name}.json`))) {
  die(`${name} はもうあります（上書きするなら --force）`);
}

// 取り込みを数える範囲: 開発用アカウントの受信箱に、この回の開始以降に届いたメール。
// 同じ staging に他のユーザーの受信箱が同居しているので、アカウントで絞る。
const ME = `(select id from auth.users where email = 'shidetake@gmail.com')`;

let since = values.since;
if (!since) {
  await prepare(set);
  since = new Date().toISOString();
  const r = spawnSync("node", ["scripts/seed-import-emails.mjs", "--set", set.name], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (r.status !== 0) die("転送に失敗しました");
}
console.log(`この回の開始: ${since}（続きからやり直す時は --since に渡す）`);

// 取り込み待ちが 0 で、件数が2回続けて動かなければ終わり。一時的に繋がらない回は飛ばす。
let prev = "";
let stable = 0;
for (let i = 0; i < 360 && stable < 2; i++) {
  if (i > 0) await new Promise((r) => setTimeout(r, 15_000));
  const r = runStagingCli([
    "db",
    "query",
    "--linked",
    `select count(*)::int total, count(*) filter (where status = 'pending')::int pending,
            count(*) filter (where status = 'extracted')::int extracted, count(*) filter (where status = 'merged')::int merged,
            count(*) filter (where status = 'error')::int error, count(*) filter (where status = 'over_quota')::int over_quota
     from inbound_emails where user_id = ${ME} and received_at >= ${lit(since)}`,
  ]);
  let row;
  try {
    row = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))).rows[0];
  } catch {
    continue;
  }
  const s = JSON.stringify(row);
  if (s !== prev) console.log(new Date().toISOString(), s);
  stable = row.total > 0 && row.pending === 0 && s === prev ? stable + 1 : 0;
  prev = s;
}
if (stable < 2) die("取り込みが90分で終わりませんでした（--since で続きから）");

const emails = stagingQuery(`
  select e.id, e.received_at, e.subject, e.sender, e.status, e.merged_into, e.trip_id, e.extracted,
         coalesce((select json_agg(json_build_object('kind', d.kind, 'status', d.status, 'payload', d.payload) order by d.created_at)
                   from inbound_drafts d where d.email_id = e.id), '[]'::json) as drafts,
         coalesce((select json_agg(json_build_object('purpose', c.purpose, 'model', c.model, 'cost', c.cost_usd, 'input', c.input_tokens,
                                                     'cached', c.cached_input_tokens, 'output', c.output_tokens, 'reasoning', c.reasoning_tokens) order by c.created_at)
                   from ai_calls c where c.unit_id = e.id::text), '[]'::json) as calls
  from inbound_emails e
  where e.user_id = ${ME} and e.received_at >= ${lit(since)}
  order by e.received_at`);
const file = writeEval(`${name}.json`, { name, set: set.name, since, takenAt: new Date().toISOString(), emails });
console.log(`${file}: メール ${emails.length} 通`);

const d = spawnSync(path.join(ROOT, "node_modules/.bin/tsx"), ["scripts/import-eval/derive.mts", name, set.name], {
  cwd: ROOT,
  stdio: "inherit",
});
if (d.status !== 0) die("画面に出る値への変換に失敗しました");

console.log(summary(score(name)));
