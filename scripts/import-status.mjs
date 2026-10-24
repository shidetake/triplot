#!/usr/bin/env node
// メール取り込みの結果を見る。
//
// `test:seed-emails` で流し直したあと、抽出が進んだかを確認するのに使う
// （転送してから取り込みが終わるまでは cron 次第で時間がかかる）。
//
// **数えるものを手順ではなくここに置く。** 確認のたびに手で SQL を書いていると、
// 書いた人が覚えている項目しか見ない。見落としたくないものはこのコマンドに足す
// （docs/development.md「規約を文書だけに置かない。機械が判定できるものはフックか、その
// 操作を行うコマンド自体に埋める」）。
//
// 今見ているもの:
//   1. メールの状態の内訳（取り込み待ち・抽出済み・合体済み・確定済み・失敗）
//   2. 未確定の下書きの件数
//   3. **合体で吸収された側に下書きが残っていないか**
//   4. 未確定の予定の下書きを、サービスの種類ごとに（予約済みとみなすか）
//
// 3 は 2026-09-13 の確認で1件見つかった。吸収された側は下書きを持たない設計
// （process.ts「来たメールは merged として畳む（draft 行は作らない）」）で、
// 41件の合体のうちその1件だけが持っていた。下書きを引くときの条件から外れる
// ので画面には出ず、実害は確認できていない。原因も未特定なので、再現するか
// どうかを知るために毎回数える。

// 読み書きするのは staging の DB（取り込みの確認は staging で行う）。本番は見ない。
// つなぎ方は scripts/staging-supabase.mjs（staging だけに絞ったトークン）。
import { stagingQuery as dbQuery } from "./staging-supabase.mjs";

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

// ── 3. 予定の下書きのサービスの種類 ──
// 予約済みとみなす（確定すると予約の TODO を済みで作る）かは種類で決まる
// （packages/shared/src/import/bookedService.ts）。種類の読み違いはそのまま
// 「予約済み」の付け間違いになるので、見出しを並べて目で確かめられるようにする。
// 判定の規則は bookedService.ts と同じものをここにも書いている。
const BOOKED_SERVICES = new Set([
  "flight",
  "rail",
  "ferry",
  "bus",
  "lodging",
  "dining",
  "activity",
]);
const eventDrafts = dbQuery(`
  select coalesce(d.payload->>'service',
                  case when d.payload->'resolvedFlight' is not null
                            and d.payload->'resolvedFlight' <> 'null'::jsonb
                       then 'flight' end) as service,
         (d.payload->>'timeFromReceipt')::boolean as from_receipt,
         d.payload->>'title' as title
  from inbound_drafts d
  where d.kind = 'event' and d.status = 'pending'
  order by 1, 3;
`);

console.log("");
console.log(`未確定の予定の下書き: ${eventDrafts.length} 件（種類ごと）`);
const byService = new Map();
for (const r of eventDrafts) {
  const key = r.service ?? "（種類なし）";
  const list = byService.get(key) ?? [];
  list.push(r);
  byService.set(key, list);
}
for (const [service, rows] of byService) {
  const booked = rows.filter(
    (r) => !r.from_receipt && BOOKED_SERVICES.has(r.service),
  ).length;
  console.log(`  ${service}: ${rows.length} 件（予約済み ${booked}）`);
  const titles = rows.map((r) => (r.from_receipt ? `${r.title}*` : r.title));
  console.log(`      ${titles.join(", ")}`);
}
if (eventDrafts.length > 0) {
  console.log("  （* は推定の予定。予約済みにはしない）");
}
