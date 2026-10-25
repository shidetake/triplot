// 取り込みの評価（docs/import-eval.md）の共通部分。
//
// 結果のファイルは**リポジトリの外**（~/.triplot-eval/）に置く。本物のレシートの中身と、
// 本番の旅行の中身（正解）を含むため。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ROOT } from "../staging-supabase.mjs";
import { SETS } from "./sets.mjs";

export { ROOT };
export { runStagingCli, stagingQuery } from "../staging-supabase.mjs";

export const EVAL_DIR = path.join(os.homedir(), ".triplot-eval");
const PROD_REF = "cjkiglocsrtnohoxcnfh";
const ENV_FILE = path.join(ROOT, "apps/web/.env.local");

function envValue(key) {
  if (!fs.existsSync(ENV_FILE)) return null;
  const m = fs.readFileSync(ENV_FILE, "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
  return m && m[1].trim() ? m[1].trim() : null;
}

// 組の設定。採点の規則は sets.mjs（リポジトリ）、旅行の id は apps/web/.env.local
// （本番の旅行の id を公開のリポジトリに書かない）。
export function loadSet(name) {
  const set = SETS[name];
  if (!set) die(`組 "${name}" がありません（scripts/import-eval/sets.mjs）`);
  const key = name.toUpperCase();
  const stagingTrip = envValue(`TRIPLOT_EVAL_STAGING_TRIP_${key}`);
  const prodTrip = envValue(`TRIPLOT_EVAL_PROD_TRIP_${key}`);
  if (!stagingTrip || !prodTrip) {
    die(
      `apps/web/.env.local に TRIPLOT_EVAL_STAGING_TRIP_${key} と TRIPLOT_EVAL_PROD_TRIP_${key} が要ります（docs/import-eval.md）`,
    );
  }
  return { name, ...set, stagingTrip, prodTrip };
}

// 本番を**読むだけ**で問い合わせる（Management API の read-only の口。本番だけに絞った
// トークン＝apps/web/.env.local の SUPABASE_ACCESS_TOKEN）。書き込みは口の側で弾かれる。
export async function prodQuery(sql) {
  const token = envValue("SUPABASE_ACCESS_TOKEN");
  if (!token) die("apps/web/.env.local に SUPABASE_ACCESS_TOKEN（本番だけに絞ったトークン）がありません");
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${PROD_REF}/database/query/read-only`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!r.ok) die(`本番の問い合わせに失敗: ${r.status} ${(await r.text()).split(token).join("<TOKEN>")}`);
  return r.json();
}

export function evalPath(file) {
  return path.join(EVAL_DIR, file);
}

export function readEval(file) {
  const p = evalPath(file);
  if (!fs.existsSync(p)) die(`${p} がありません`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function writeEval(file, data) {
  fs.mkdirSync(EVAL_DIR, { recursive: true, mode: 0o700 });
  const p = evalPath(file);
  fs.writeFileSync(p, JSON.stringify(data, null, 1), { mode: 0o600 });
  return p;
}

// SQL のリテラル。値は自分たちの DB から読んだもの（人の入力ではない）。
export const lit = (v) =>
  v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`;

export function die(msg) {
  console.error(msg);
  process.exit(1);
}
