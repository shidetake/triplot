#!/usr/bin/env node
// メール取り込みの動作確認用のテストデータを作り直す。
//
//   1. 受信箱（inbound_emails と、cascade で inbound_drafts）を空にする
//   2. Gmail の指定ラベルのメールを1通ずつ転送先アドレスへ転送する
//
// 転送は scripts/forward-gmail.mjs をそのまま使う（あちらが単体でも使える
// 汎用ツール、こちらが「テストデータを作り直す」という手順の側）。
//
// 転送先と Gmail のラベルは apps/web/.env.local から読む。転送先アドレスは
// それを知っていれば誰でもその受信箱にメールを流し込めるので、コミットする
// ファイルには書かない。
//
//   TRIPLOT_RECEIPTS_ADDRESS=receipts+xxxxxxxx@triplot.app
//   TRIPLOT_TEST_GMAIL_LABEL=2026-04-28-hawaii
//
// 消すのは**その転送先アドレス宛の行だけ**。同じ DB に他ユーザーの受信箱が
// 同居しているので、テーブルごと truncate しない。
//
// 転送済みの記録（forward-gmail.mjs の state）は毎回作り直す。同じメールを
// 何度でも流し直せることがこのスクリプトの目的なので、前回の記録が残っていると
// 全部スキップされてしまう。

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

const ROOT = path.join(import.meta.dirname, "..");
const ENV_FILE = path.join(ROOT, "apps/web/.env.local");
// forward-gmail.mjs の既定の state とは別ファイルにする（あちらを単体で使う
// ときの記録を壊さないため）。
const STATE_FILE = path.join(os.homedir(), ".gmail-mcp", "seed_state.json");

function readEnv(name) {
  if (process.env[name]) return process.env[name];
  if (!fs.existsSync(ENV_FILE)) return undefined;
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
    const m = line.match(new RegExp(`^${name}=(.*)$`));
    if (m) return m[1].replace(/^"|"$/g, "").trim();
  }
  return undefined;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
  return r;
}

function dbQuery(sql) {
  const token = readEnv("SUPABASE_ACCESS_TOKEN");
  if (!token) {
    console.error(`SUPABASE_ACCESS_TOKEN が ${ENV_FILE} にありません。`);
    process.exit(1);
  }
  const r = spawnSync("npx", ["supabase", "db", "query", "--linked", sql], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status ?? 1);
  }
  // 出力は JSON だが前後に進捗行が混ざるので、最初の { から読む。
  const body = r.stdout.slice(r.stdout.indexOf("{"));
  try {
    return JSON.parse(body).rows ?? [];
  } catch {
    return [];
  }
}

const { values } = parseArgs({
  options: {
    to: { type: "string" },
    label: { type: "string" },
    limit: { type: "string", short: "n" },
    "keep-inbox": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log(`
メール取り込みのテストデータを作り直す（受信箱を空にしてから全部転送し直す）

  npm run test:seed-emails                 受信箱を空にして全部転送
  npm run test:seed-emails -- -n 5         5通だけ（動作確認用）
  npm run test:seed-emails -- --dry-run    転送せず、対象と件数だけ出す
  npm run test:seed-emails -- --keep-inbox 受信箱を消さずに転送だけ

  --to <address>   転送先（既定: .env.local の TRIPLOT_RECEIPTS_ADDRESS）
  --label <label>  Gmail のラベル（既定: .env.local の TRIPLOT_TEST_GMAIL_LABEL）
`);
  process.exit(0);
}

const to = values.to ?? readEnv("TRIPLOT_RECEIPTS_ADDRESS");
const label = values.label ?? readEnv("TRIPLOT_TEST_GMAIL_LABEL");
const dryRun = values["dry-run"];

if (!to) {
  console.error(
    `転送先が分かりません。${ENV_FILE} に TRIPLOT_RECEIPTS_ADDRESS を書くか --to で渡してください。`,
  );
  process.exit(1);
}
if (!label) {
  console.error(
    `Gmail のラベルが分かりません。${ENV_FILE} に TRIPLOT_TEST_GMAIL_LABEL を書くか --label で渡してください。`,
  );
  process.exit(1);
}

console.log(`転送先:   ${to}`);
console.log(`ラベル:   label:${label}`);
console.log(`モード:   ${dryRun ? "DRY-RUN（消さない・送らない）" : "実行"}\n`);

// ── 1. 受信箱を空にする ──
if (values["keep-inbox"]) {
  console.log("受信箱: --keep-inbox のため残します\n");
} else {
  const escaped = to.replaceAll("'", "''");
  const [before] = dbQuery(
    `select count(*)::int as n from inbound_emails where recipient = '${escaped}'`,
  );
  const n = before?.n ?? 0;
  if (dryRun) {
    console.log(`受信箱: ${n} 件（DRY-RUN なので消しません）\n`);
  } else if (n === 0) {
    console.log("受信箱: 既に空です\n");
  } else {
    dbQuery(`delete from inbound_emails where recipient = '${escaped}'`);
    const [after] = dbQuery(
      `select count(*)::int as n from inbound_emails where recipient = '${escaped}'`,
    );
    console.log(
      `受信箱: ${n} 件を削除しました（残り ${after?.n ?? "?"} 件）\n`,
    );
  }
}

// ── 2. 転送済みの記録を捨てる（同じメールを再度送れるようにする）──
if (!dryRun && fs.existsSync(STATE_FILE)) {
  fs.rmSync(STATE_FILE);
  console.log(`転送済みの記録を削除: ${STATE_FILE}\n`);
}

// ── 3. 転送 ──
const args = [
  "scripts/forward-gmail.mjs",
  "--query",
  `label:${label}`,
  "--to",
  to,
  "--state",
  STATE_FILE,
];
if (values.limit) args.push("--limit", values.limit);
if (dryRun) args.push("--dry-run");

run("node", args);
