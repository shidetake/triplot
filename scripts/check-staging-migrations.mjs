#!/usr/bin/env node
// **migration を入れたら staging にも当てる**、を push の時に確かめる。
//
// 当て忘れると、プレビューだけ古いスキーマで動く。壊れ方が「原因不明の不具合」
// の形で出るので、気付くのが遅れる（docs/development.md「web の動作確認は staging で行う」）。
//
// 本番との差は db:types:check が見ている（生成した型と実 DB の突き合わせ）が、
// staging は誰も見ていなかった。ここが担当する。
//
// 資格情報が無い環境（CI・他人のマシン）では黙って通す。db:types:check と同じ扱い。

import fs from "node:fs";
import path from "node:path";

import { hasStagingCredentials, runStagingCli } from "./staging-supabase.mjs";

const MIGRATIONS_DIR = "supabase/migrations";

if (!hasStagingCredentials()) {
  console.log("check-staging-migrations: skip（staging のトークンが無い）");
  process.exit(0);
}

const local = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => f.split("_")[0])
  .sort();
if (local.length === 0) process.exit(0);

const q = runStagingCli([
  "db",
  "query",
  "--linked",
  "select version from supabase_migrations.schema_migrations",
]);
if (q.status !== 0) {
  // 落ちている・繋がらないだけで push を止めない（当て忘れを見つけるのが目的で、
  // 疎通監視ではない）。
  console.log("check-staging-migrations: skip（staging に繋げなかった）");
  process.exit(0);
}
const applied = new Set([...q.stdout.matchAll(/"version"\s*:\s*"(\d+)"/g)].map((m) => m[1]));
const missing = local.filter((v) => !applied.has(v));

if (missing.length === 0) {
  console.log(`check-staging-migrations: OK（${local.length} 本とも当たっている）`);
  process.exit(0);
}

console.error("");
console.error("staging に当たっていない migration がある:");
for (const v of missing) {
  const f = fs
    .readdirSync(MIGRATIONS_DIR)
    .find((x) => x.startsWith(`${v}_`));
  console.error(`  ${path.join(MIGRATIONS_DIR, f ?? v)}`);
}
console.error("");
console.error("当ててから push する:");
console.error("  npm run db:push:staging");
console.error("");
console.error("当て忘れると、プレビューだけ古いスキーマで動いて原因不明の");
console.error("不具合に見える（docs/development.md「staging DB への migration」）。");
process.exit(1);
