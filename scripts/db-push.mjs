// 本番の DB に migration を当てる（npm run db:push）。
//
// 本番だけに絞ったトークン（apps/web/.env.local の SUPABASE_ACCESS_TOKEN）で、
// supabase/ の link 先（本番）に当てる。`supabase login` でこの Mac に保存した
// トークン（アカウント全体に効く）には頼らない。トークンは引数ではなく環境変数で
// 渡し、CLI も npx を通さず直接呼ぶ（npm 12 は npx の引数を表示する）。

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const PROD_REF = "cjkiglocsrtnohoxcnfh";
const ENV_FILE = path.join(ROOT, "apps/web/.env.local");

const token = fs.existsSync(ENV_FILE)
  ? fs
      .readFileSync(ENV_FILE, "utf8")
      .match(/^SUPABASE_ACCESS_TOKEN=(.*)$/m)?.[1]
      .trim()
  : undefined;
if (!token) {
  console.error(
    "db-push: SUPABASE_ACCESS_TOKEN が apps/web/.env.local にありません（本番だけに絞ったトークン）。",
  );
  process.exit(1);
}
const refFile = path.join(ROOT, "supabase/.temp/project-ref");
const ref = fs.existsSync(refFile) ? fs.readFileSync(refFile, "utf8").trim() : "";
if (ref !== PROD_REF) {
  console.error(
    `db-push: supabase/ の link 先が本番 (${PROD_REF}) ではありません（${ref || "未設定"}）。node scripts/supabase-link.mjs を走らせてください。`,
  );
  process.exit(1);
}

console.log("db-push: 本番に migration を適用します");
const r = spawnSync(
  path.join(ROOT, "node_modules/.bin/supabase"),
  ["db", "push", "--linked", ...process.argv.slice(2)],
  {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  },
);
if (r.status !== 0) process.exit(r.status ?? 1);
console.log("db-push: 完了");
