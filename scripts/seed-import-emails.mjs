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

// 転送するメールの組（旅行ごと）。**環境ファイルに1行足すだけで増やせる**ように、
// キーの接頭辞で拾う。
//
//   TRIPLOT_TEST_GMAIL_LABEL_HAWAII=2026-04-28-hawaii
//   TRIPLOT_TEST_GMAIL_LABEL_LA=2025-04-26 LA
//
// ラベルは各自の Gmail のもので、環境ファイル（gitignore 済み）に置く。
const LABEL_PREFIX = "TRIPLOT_TEST_GMAIL_LABEL_";

function readLabelSets() {
  const sets = new Map();
  const add = (key, value) => {
    if (!key.startsWith(LABEL_PREFIX)) return;
    const name = key.slice(LABEL_PREFIX.length).toLowerCase();
    const v = value.replace(/^"|"$/g, "").trim();
    if (name && v && !sets.has(name)) sets.set(name, v);
  };
  for (const [k, v] of Object.entries(process.env)) add(k, v ?? "");
  if (fs.existsSync(ENV_FILE)) {
    for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) add(m[1], m[2]);
    }
  }
  return sets;
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
    set: { type: "string", short: "s" },
    label: { type: "string" },
    limit: { type: "string", short: "n" },
    "keep-inbox": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
  },
});

const sets = readLabelSets();
const setNames = [...sets.keys()].sort();

if (values.help) {
  console.log(`
メール取り込みのテストデータを作り直す（受信箱を空にしてから、選んだ組を転送し直す）

  npm run test:seed-emails -- --set la          LA の組を転送
  npm run test:seed-emails -- --set hawaii -n 5 5通だけ（動作確認用）
  npm run test:seed-emails -- --set la --dry-run   転送せず、対象と件数だけ出す
  npm run test:seed-emails -- --set la --keep-inbox 受信箱を消さずに転送だけ

  --set <name>     どの組を転送するか（下記）。**必ず選ぶ**
  --to <address>   転送先（既定: .env.local の TRIPLOT_RECEIPTS_ADDRESS）
  --label <label>  Gmail のラベルを直接指定（--set の代わり）

  選べる組: ${setNames.length > 0 ? setNames.join(" / ") : "（未設定）"}

  組は ${ENV_FILE} に1行足すと増える:
    ${LABEL_PREFIX}<組の名前>=<Gmail のラベル>
`);
  process.exit(0);
}

const to = values.to ?? readEnv("TRIPLOT_RECEIPTS_ADDRESS");
const dryRun = values["dry-run"];

// **まとめて全部は送らない。** 受信箱は毎回空にしてから転送するので、組を
// 跨いで送ると「今どの旅行を見ているか」が混ざる。2つ流したい時は2回叩く。
let label = values.label ?? null;
if (!label) {
  const name = values.set?.toLowerCase();
  if (!name) {
    console.error(
      setNames.length > 0
        ? `どの組を転送するか選んでください: --set ${setNames.join(" | ")}`
        : `転送する組が設定されていません。${ENV_FILE} に ${LABEL_PREFIX}<組の名前>=<Gmail のラベル> を足してください。`,
    );
    process.exit(1);
  }
  label = sets.get(name) ?? null;
  if (!label) {
    console.error(
      `そんな組はありません: ${name}\n選べる組: ${setNames.join(" | ") || "（未設定）"}`,
    );
    process.exit(1);
  }
}

if (!to) {
  console.error(
    `転送先が分かりません。${ENV_FILE} に TRIPLOT_RECEIPTS_ADDRESS を書くか --to で渡してください。`,
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
