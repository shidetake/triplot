import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DB } from "../src/data/client";
import { createEvent } from "../src/data/events";
import { createExpense } from "../src/data/expenses";
import { ensureTripInvite } from "../src/data/invites";
import { createPlace } from "../src/data/places";
import { createTrip, deleteTrip } from "../src/data/trips";

import { DBTEST_PREFIX, dbTestEnv, signIn } from "./helpers";

// 旅行を作って、ひととおり中身を入れて、最後に消す。実 DB でしか出ない
// 壊れ方（トリガと cascade の噛み合わせ・RLS・RPC の引数）を捕まえるのが目的で、
// 値の形は純関数側のユニットテストが見ている。ここは**操作が通るか / 最後に
// 消えるか**だけを見る（中間状態を細かく検査すると、落ちた時に原因を追うのが
// 大変になる）。
//
// 実際にこれで捕まえられた不具合:
//   旅行に「移動の予定」と「それを参照する予定・費用」の両方があると
//   削除が失敗する（events の BEFORE DELETE トリガが、同じ文の cascade で
//   消える行を UPDATE しに行く）。下のシナリオはその形を必ず作る。

const env = dbTestEnv();
const describeDb = env ? describe : describe.skip;

if (!env) {
  console.warn(
    "[dbtests] apps/web/.env.development.local が無いのでスキップ。" +
      " staging の URL/anon key と開発用ログインの資格情報が要る。",
  );
}

describeDb("旅行のライフサイクル（実 DB）", () => {
  let sb: DB;
  let userId: string;

  beforeAll(async () => {
    ({ sb, userId } = await signIn(env!));
    await sweepLeftovers(sb, userId);
  });

  afterAll(async () => {
    if (sb) await sweepLeftovers(sb, userId);
  });

  it("作って、中身を入れて、消せる", async () => {
    const created = await createTrip(sb, {
      title: `${DBTEST_PREFIX}${Date.now()}`,
      startDate: "2027-06-01",
      endDate: "2027-06-05",
      displayName: "dbtest",
      currency: "JPY",
      clientTz: "Asia/Tokyo",
    });
    expect(created.ok, JSON.stringify(created)).toBe(true);
    if (!created.ok) return;
    const tripId = created.data.tripId;

    const me = await myMemberId(sb, tripId, userId);
    const categoryId = await firstCategoryId(sb, tripId);

    // 1. 時差移動。これが後続の「参照される側」になる。
    const transit = await createEvent(
      sb,
      tripId,
      {
        kind: "transit",
        allDay: false,
        title: "NRT-HNL",
        startAt: "2027-06-01T19:10:00",
        endAt: "2027-06-01T07:25:00",
        startTz: "Asia/Tokyo",
        endTz: "Pacific/Honolulu",
        tzDisambigTransitId: null,
        tzDisambigSide: null,
        visibility: "shared",
        note: "",
        participantMemberIds: [],
        startPlace: { kind: "free", label: "成田国際空港" },
        endPlace: { kind: "free", label: "ホノルル国際空港" },
      },
      false,
    );
    expect(transit.ok, JSON.stringify(transit)).toBe(true);
    if (!transit.ok) return;

    // 2. その移動を参照する通常の予定（移動日にどちら側の TZ かの記録）。
    //    削除が壊れていたのはこの組み合わせ。
    const dinner = await createEvent(
      sb,
      tripId,
      {
        kind: "normal",
        allDay: false,
        title: "夕食",
        startAt: "2027-06-01T18:00:00",
        endAt: "2027-06-01T20:00:00",
        startTz: null,
        endTz: null,
        tzDisambigTransitId: transit.data,
        tzDisambigSide: "arrive",
        visibility: "shared",
        note: "",
        participantMemberIds: [],
        startPlace: { kind: "free", label: "どこかの店" },
        endPlace: null,
      },
      false,
    );
    expect(dinner.ok, JSON.stringify(dinner)).toBe(true);

    // 3. 同じく移動を参照する費用。
    const expense = await createExpense(sb, tripId, {
      localPrice: 12.5,
      localCurrency: "USD",
      rateToDefault: 150,
      categoryId,
      payerMemberId: me,
      visibility: "shared",
      splittable: true,
      splitMemberIds: [me],
      note: "",
      paidAt: "2027-06-01",
      tzDisambigTransitId: transit.ok ? transit.data : null,
      tzDisambigSide: "arrive",
      place: { kind: "free", label: "どこかの店" },
    });
    expect(expense.ok, JSON.stringify(expense)).toBe(true);

    // 4. 場所と招待リンク（旅行にぶら下がる他のテーブルも巻き込む）。
    const place = await createPlace(sb, tripId, {
      name: "ワイキキビーチ",
      tentative: false,
      visibility: "shared",
      note: "",
      googlePlaceId: "",
      lat: 21.276,
      lng: -157.827,
      formattedAddress: "",
      icon: "",
      region: "",
      locality: "",
    });
    expect(place.ok, JSON.stringify(place)).toBe(true);

    const invite = await ensureTripInvite(sb, tripId, `dbtest-${Date.now()}`);
    expect(invite.ok, JSON.stringify(invite)).toBe(true);

    // 5. 削除。ここが本題。
    const deleted = await deleteTrip(sb, tripId, userId);
    expect(deleted.ok, JSON.stringify(deleted)).toBe(true);

    const { data: left } = await sb.from("trips").select("id").eq("id", tripId);
    expect(left ?? []).toHaveLength(0);
  });
});

async function myMemberId(sb: DB, tripId: string, userId: string) {
  const { data } = await sb
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .single();
  if (!data) throw new Error("作成した旅行に自分のメンバー行が無い");
  return data.id;
}

async function firstCategoryId(sb: DB, tripId: string) {
  const { data } = await sb
    .from("expense_categories")
    .select("id")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("既定の費用カテゴリが seed されていない");
  return data.id;
}

// 前回落ちて消せなかったぶんを消す。**接頭辞が付いた自分の旅行だけ**が対象で、
// staging の他のデータには触れない。
async function sweepLeftovers(sb: DB, userId: string) {
  const { data } = await sb
    .from("trips")
    .select("id, title")
    .like("title", `${DBTEST_PREFIX}%`);
  for (const t of data ?? []) await deleteTrip(sb, t.id, userId);
}
