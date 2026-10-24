// staging の Supabase を CLI で触るための共通の入口。スクリプトは staging の DB に
// 直接つながず、必ずここを通す。
//
// **パスワードを使わない。** staging だけに絞った Supabase の管理用トークン
// （スコープ付き。apps/web/.env.staging.local の SUPABASE_ACCESS_TOKEN）で入る。
// 以前は DB のパスワード入りの接続文字列をコマンドの引数で渡していて、npm 12 が
// `npx` の引数を `npm notice run ...` として表示するため、`db:push:staging` の
// たびにパスワードが画面に出ていた。トークンは引数ではなく環境変数で渡し、
// CLI も npx を通さず直接呼ぶ（どちらの経路でも値が表示されない）。
//
// **staging の link は supabase-staging/ に別に持つ。** CLI が覚える link 先は
// フォルダに1つで、supabase/ の link は本番に固定してある（張り替えない）。
// supabase-staging/supabase/ は config と migrations を本体へのシンボリック
// リンクで共有し、.temp/ にだけ staging の link 先を置く（scripts/supabase-link.mjs）。

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const ROOT = path.join(import.meta.dirname, "..");
export const STAGING_REF = "xuytnpkvmiduffigimol";
const ENV_FILE = path.join(ROOT, "apps/web/.env.staging.local");
const WORKDIR = path.join(ROOT, "supabase-staging");
const CLI = path.join(ROOT, "node_modules/.bin/supabase");

function readToken() {
  if (!fs.existsSync(ENV_FILE)) return null;
  const m = fs.readFileSync(ENV_FILE, "utf8").match(/^SUPABASE_ACCESS_TOKEN=(.*)$/m);
  return m && m[1].trim() ? m[1].trim() : null;
}

// 資格情報の無い環境（CI・他人のマシン）で、検査を黙って通すかの判定に使う。
export function hasStagingCredentials() {
  return readToken() !== null;
}

function stagingToken() {
  const token = readToken();
  if (token) return token;
  console.error(
    `SUPABASE_ACCESS_TOKEN が ${path.relative(ROOT, ENV_FILE)} にありません（staging だけに絞ったトークン）。`,
  );
  process.exit(1);
}

// link 先が staging であることを確かめる。本番を向いていたら何もせず止める。
function assertLinkedToStaging() {
  const refFile = path.join(WORKDIR, "supabase/.temp/project-ref");
  const ref = fs.existsSync(refFile) ? fs.readFileSync(refFile, "utf8").trim() : "";
  if (ref !== STAGING_REF) {
    console.error(
      `supabase-staging の link 先が staging (${STAGING_REF}) ではありません（${ref || "未設定"}）。node scripts/supabase-link.mjs を走らせてください。`,
    );
    process.exit(1);
  }
}

// staging に向けて supabase CLI を動かす。inherit なら出力をそのまま流す
// （トークンは環境変数なので出力には出ない）。
export function runStagingCli(args, { inherit = false } = {}) {
  assertLinkedToStaging();
  const token = stagingToken();
  const r = spawnSync(CLI, ["--workdir", WORKDIR, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: inherit ? "inherit" : "pipe",
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  });
  // 念のため、捕まえた出力からもトークンを伏せる（エラー表示で外に出さない）。
  const hide = (s) => (s ?? "").split(token).join("<TOKEN>");
  return { status: r.status, stdout: hide(r.stdout), stderr: hide(r.stderr) };
}

// staging に SQL を1文流して行を返す。失敗したらエラーを出して止める。
export function stagingQuery(sql) {
  const r = runStagingCli(["db", "query", "--linked", sql]);
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status ?? 1);
  }
  const body = r.stdout.slice(r.stdout.indexOf("{"));
  try {
    return JSON.parse(body).rows ?? [];
  } catch {
    return [];
  }
}
