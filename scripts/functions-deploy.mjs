// Supabase の Edge Function を配備する。
//
//   npm run functions:deploy -- <関数の名前>             本番
//   npm run functions:deploy -- <関数の名前> --staging   staging
//
// トークンは db:push と同じく、プロジェクトごとに絞った管理用トークン
// （本番は apps/web/.env.local、staging は apps/web/.env.staging.local の
// SUPABASE_ACCESS_TOKEN）。引数ではなく環境変数で渡し、CLI も npx を通さず
// 直接呼ぶ（npm 12 は npx の引数を表示する）。
//
// 設定値（supabase secrets）はここでは入れない。秘密の値をコマンドの引数に
// 載せないよう、値は各関数の説明どおり --env-file で入れる。

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
// どちらも supabase/functions/ から配備する（supabase-staging/ には関数を
// リンクしていない）ので、link 先ではなく --project-ref で行き先を決める。
const TARGETS = {
  production: { ref: "cjkiglocsrtnohoxcnfh", envFile: "apps/web/.env.local", label: "本番" },
  staging: { ref: "xuytnpkvmiduffigimol", envFile: "apps/web/.env.staging.local", label: "staging" },
};

const args = process.argv.slice(2);
const target = args.includes("--staging") ? TARGETS.staging : TARGETS.production;
const name = args.find((a) => !a.startsWith("--"));
if (!name || !fs.existsSync(path.join(ROOT, "supabase/functions", name))) {
  console.error(
    "functions-deploy: 関数の名前を渡してください（supabase/functions/ の下のフォルダ名）。",
  );
  process.exit(1);
}

const envPath = path.join(ROOT, target.envFile);
const token = fs.existsSync(envPath)
  ? fs
      .readFileSync(envPath, "utf8")
      .match(/^SUPABASE_ACCESS_TOKEN=(.*)$/m)?.[1]
      .trim()
  : undefined;
if (!token) {
  console.error(
    `functions-deploy: SUPABASE_ACCESS_TOKEN が ${target.envFile} にありません（${target.label}だけに絞ったトークン）。`,
  );
  process.exit(1);
}

console.log(`functions-deploy: ${target.label}に ${name} を配備します`);
const r = spawnSync(
  path.join(ROOT, "node_modules/.bin/supabase"),
  // --use-api: 手元の Docker を使わず、Supabase 側で組み立てる。
  ["functions", "deploy", name, "--use-api", "--project-ref", target.ref],
  {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  },
);
process.exit(r.status ?? 1);
