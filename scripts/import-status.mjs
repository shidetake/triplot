#!/usr/bin/env node
// メール取り込みの結果を見る。
//
// `test:seed-emails` で流し直したあと、抽出が進んだかを確認するのに使う
// （転送してから取り込みが終わるまでは cron 次第で時間がかかる）。
//
// **数えるものを手順ではなくここに置く。** 確認のたびに手で SQL を書いていると、
// 書いた人が覚えている項目しか見ない。見落としたくないものはこのコマンドに足す
// （AGENTS.md「規約を文書だけに置かない。機械が判定できるものはフックか、その
// 操作を行うコマンド自体に埋める」）。
//
// 今見ているもの:
//   1. メールの状態の内訳（取り込み待ち・抽出済み・合体済み・確定済み・失敗）
//   2. 未確定の下書きの件数
//   3. **合体で吸収された側に下書きが残っていないか**
//
// 3 は 2026-09-13 の確認で1件見つかった。吸収された側は下書きを持たない設計
// （process.ts「来たメールは merged として畳む（draft 行は作らない）」）で、
// 41件の合体のうちその1件だけが持っていた。下書きを引くときの条件から外れる
// ので画面には出ず、実害は確認できていない。原因も未特定なので、再現するか
// どうかを知るために毎回数える。

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const ENV_FILE = path.join(ROOT, "apps/web/.env.local");

function readEnv(name) {
  if (process.env[name]) return process.env[name];
  if (!fs.existsSync(ENV_FILE)) return undefined;
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
    const m = line.match(new RegExp(`^${name}=(.*)$`));
    if (m) return m[1].replace(/^"|"$/g, "").trim();
  }
  return undefined;
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
  const body = r.stdout.slice(r.stdout.indexOf("{"));
  try {
    return JSON.parse(body).rows ?? [];
  } catch {
    return [];
  }
}

const STATUS_LABEL = {
  pending: "取り込み待ち",
  extracted: "抽出済み",
  merged: "合体済み",
  confirmed: "確定済み",
  dismissed: "破棄済み",
  error: "失敗",
  over_quota: "上限超過",
};

// ── 1. メールの状態と、そこにぶら下がる未確定の下書き ──
const byStatus = dbQuery(`
  select e.status,
         count(distinct e.id)::int as emails,
         count(d.id) filter (where d.status = 'pending')::int as pending_drafts
  from inbound_emails e
  left join inbound_drafts d on d.email_id = e.id
  group by e.status
  order by e.status;
`);

const total = byStatus.reduce((n, r) => n + r.emails, 0);
console.log(`メール ${total} 通`);
for (const r of byStatus) {
  const label = STATUS_LABEL[r.status] ?? r.status;
  console.log(
    `  ${label.padEnd(6, "　")} ${String(r.emails).padStart(4)} 通 ` +
      `／ 未確定の下書き ${r.pending_drafts} 件`,
  );
}

// ── 2. 合体で吸収された側に残った下書き ──
const leftovers = dbQuery(`
  select d.id, d.kind, e.subject,
         to_char(e.received_at at time zone 'Asia/Tokyo', 'MM/DD HH24:MI') as received_jst,
         coalesce(d.payload->>'title', d.payload->>'merchant', '') as label
  from inbound_drafts d
  join inbound_emails e on e.id = d.email_id
  where d.status = 'pending' and e.status = 'merged'
  order by e.received_at;
`);

console.log("");
if (leftovers.length === 0) {
  console.log("合体で吸収された側に残った下書き: 0 件");
} else {
  console.log(`合体で吸収された側に残った下書き: ${leftovers.length} 件`);
  console.log("  （吸収された側は下書きを持たない設計。残っていたら中身を確認する）");
  for (const r of leftovers) {
    console.log(`  - ${r.received_jst} ${r.subject}`);
    console.log(`      ${r.kind}: ${r.label}`);
  }
}
