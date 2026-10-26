// 取り込みの結果（~/.triplot-eval/<名前>.json）を、画面と同じ関数に通して
// 「画面に出る値」にし、~/.triplot-eval/derived-<名前>.json に置く。
//
// 保存されている下書きをそのまま比べない。カードの通知の日時を現地に直す処理や、
// 同じ時間・同じ場所の予定をまとめる処理は表示の時にかかるので、利用者が見る値は
// 下書きの値と違う。採点はその見える値で行う（docs/import-eval.md）。
//
// 旅行の今の状態（確定済みのフライト・場所・カテゴリ）を読むので、流した直後
// （次の回の準備で旅行を作り直す前）に走らせる。run.mjs が続けて呼ぶ。
//
// 使い方: tsx scripts/import-eval/derive.mts <名前> <組>

import {
  deriveEventDraftItemsWithTimeline,
  deriveExpenseDraftItems,
  draftEventTimes,
  type PendingDraft,
} from "../../packages/shared/src/import/drafts.ts";
import { buildTripTzTimeline } from "../../packages/shared/src/schedule.ts";
import { deriveScheduleEvents, type RawEvent } from "../../packages/shared/src/tripDerive.ts";
import { lit, loadSet, readEval, stagingQuery, writeEval } from "./lib.mjs";

const [name, setName] = process.argv.slice(2);
if (!name || !setName) {
  console.error("使い方: tsx scripts/import-eval/derive.mts <名前> <組>");
  process.exit(1);
}
const set = loadSet(setName);
const TRIP = lit(set.stagingTrip);
const run = readEval(`${name}.json`);

// 画面と同じく、未確定の下書き（pending）だけ。id はメールと並び順から作る。
const drafts: PendingDraft[] = [];
for (const e of run.emails) {
  e.drafts.forEach((d: { kind: string; status: string; payload: unknown }, i: number) => {
    if (d.status === "pending") {
      drafts.push({ id: `${e.id}#${i}`, email_id: e.id, kind: d.kind, payload: d.payload } as PendingDraft);
    }
  });
}

const [trip] = stagingQuery(`select default_timezone, default_currency from trips where id = ${TRIP}`);
const eventsRaw = stagingQuery(`
  select e.*, coalesce((select json_agg(json_build_object('member_id', p.member_id)) from event_participants p where p.event_id = e.id), '[]'::json) event_participants
  from events e where e.trip_id = ${TRIP}`) as RawEvent[];
const places = stagingQuery(`select id, name, formatted_address from places where trip_id = ${TRIP}`).map(
  (p: { id: string; name: string; formatted_address: string | null }) => ({ id: p.id, name: p.name, formattedAddress: p.formatted_address }),
);
const categories = stagingQuery(`select id, name from expense_categories where trip_id = ${TRIP}`) as { id: string; name: string }[];
const [me] = stagingQuery(`select m.id from trip_members m join auth.users u on u.id = m.user_id where m.trip_id = ${TRIP} and u.email = 'shidetake@gmail.com'`);

const scheduleEvents = deriveScheduleEvents(eventsRaw, []);
const tzTimeline = buildTripTzTimeline(scheduleEvents, trip.default_timezone);

const expenseItems = deriveExpenseDraftItems(drafts, {
  categories,
  defaultCurrency: trip.default_currency,
  fallbackCategoryId: categories[0].id,
  places,
  unknownMerchantLabel: "(不明)",
  tzTimeline,
});
const { items: eventItems } = deriveEventDraftItemsWithTimeline(drafts, scheduleEvents, trip.default_timezone, {
  places,
  locale: "ja",
  untitledLabel: "(無題)",
  reservationRefLabel: (ref: string) => `予約番号: ${ref}`,
  myMemberId: me?.id ?? null,
});

const payloadById = new Map(drafts.map((d) => [d.id, d.payload]));
const catName = new Map(categories.map((c) => [c.id, c.name]));
const out = {
  name,
  set: setName,
  expenses: expenseItems.map((x) => ({
    id: x.id,
    emailId: x.emailId,
    date: x.initialPaidAt,
    time: x.initialTime ?? null,
    price: x.initialPrice,
    currency: x.initialCurrency,
    category: catName.get(x.initialCategoryId) ?? null,
    label: x.labelParts,
  })),
  events: eventItems.map((x) => ({
    id: x.id,
    draftIds: x.draftIds,
    emailIds: x.emailIds,
    title: x.prefill.title,
    place: (x.prefill.place as { name?: string } | null)?.name ?? null,
    kind: x.prefill.kind3,
    ...draftEventTimes(x),
    // 時刻が分かっていたか（分からないと画面では 09:00 に置かれる）。元の下書きで見る。
    timeKnown: x.draftIds.some((id) => !!(payloadById.get(id) as { startTime?: string | null } | undefined)?.startTime),
    label: x.labelParts,
  })),
};
writeEval(`derived-${name}.json`, out);
console.log(`画面に出る値: 費用 ${out.expenses.length} 件・予定 ${out.events.length} 件（まとめた後）`);
