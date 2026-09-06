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
        participantsEveryone: true,
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
        participantsEveryone: true,
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
      splitEveryone: false,
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

  // 「全員参加」を参加者テーブルの行が無いことから推測するのをやめ、
  // participants_everyone として持つようにした（20260906000100）。この形が
  // 実 DB で本当に効いているかは、RPC を通さないと分からない
  // （純関数のテストは「フラグを渡せばフラグが返る」ことしか見ていない）。
  it("全員参加は行の有無ではなくフラグで持つ", async () => {
    const created = await createTrip(sb, {
      title: `${DBTEST_PREFIX}participants-${Date.now()}`,
      startDate: "2027-07-01",
      endDate: "2027-07-03",
      displayName: "dbtest",
      currency: "JPY",
      clientTz: "Asia/Tokyo",
    });
    expect(created.ok, JSON.stringify(created)).toBe(true);
    if (!created.ok) return;
    const tripId = created.data.tripId;
    const me = await myMemberId(sb, tripId, userId);

    const base = {
      kind: "normal" as const,
      allDay: false,
      startAt: "2027-07-01T12:00:00",
      endAt: "2027-07-01T13:00:00",
      startTz: null,
      endTz: null,
      tzDisambigTransitId: null,
      tzDisambigSide: null,
      visibility: "shared" as const,
      note: "",
      startPlace: { kind: "free" as const, label: "どこか" },
      endPlace: null,
    };

    // 全員参加: 参加者の行は作らず、フラグだけが true。
    const all = await createEvent(
      sb,
      tripId,
      { ...base, title: "全員", participantsEveryone: true, participantMemberIds: [] },
      false,
    );
    expect(all.ok, JSON.stringify(all)).toBe(true);

    // 一部の人: フラグは false で、参加者の行が入る。
    const some = await createEvent(
      sb,
      tripId,
      { ...base, title: "一部", participantsEveryone: false, participantMemberIds: [me] },
      false,
    );
    expect(some.ok, JSON.stringify(some)).toBe(true);

    const { data: rows } = await sb
      .from("events")
      .select("title, participants_everyone, event_participants(member_id)")
      .eq("trip_id", tripId);
    const byTitle = new Map((rows ?? []).map((r) => [r.title, r]));
    expect(byTitle.get("全員")?.participants_everyone).toBe(true);
    expect(byTitle.get("全員")?.event_participants ?? []).toHaveLength(0);
    expect(byTitle.get("一部")?.participants_everyone).toBe(false);
    expect(byTitle.get("一部")?.event_participants ?? []).toHaveLength(1);

    // 「一部の人」なのに誰も居ない、は作らせない（入口で弾く）。
    const empty = await createEvent(
      sb,
      tripId,
      { ...base, title: "空", participantsEveryone: false, participantMemberIds: [] },
      false,
    );
    expect(empty.ok).toBe(false);

    const deleted = await deleteTrip(sb, tripId, userId);
    expect(deleted.ok, JSON.stringify(deleted)).toBe(true);
  });

  // 費用の割り勘も予定の参加者と同じ形にした（20260906000200）。
  // 「全員」で作った費用が具体的な ID を焼き込まないことを実 DB で確かめる
  // ——ここが焼き込まれていると、後から旅行に加わった人が割り勘に入らない。
  it("全員で割り勘は行の有無ではなくフラグで持つ", async () => {
    const created = await createTrip(sb, {
      title: `${DBTEST_PREFIX}split-${Date.now()}`,
      startDate: "2027-08-01",
      endDate: "2027-08-03",
      displayName: "dbtest",
      currency: "JPY",
      clientTz: "Asia/Tokyo",
    });
    expect(created.ok, JSON.stringify(created)).toBe(true);
    if (!created.ok) return;
    const tripId = created.data.tripId;
    const me = await myMemberId(sb, tripId, userId);
    const categoryId = await firstCategoryId(sb, tripId);

    const base = {
      localPrice: 1000,
      localCurrency: "JPY" as const,
      rateToDefault: 1,
      categoryId,
      payerMemberId: me,
      visibility: "shared" as const,
      splittable: true,
      note: "",
      paidAt: "2027-08-01",
      tzDisambigTransitId: null,
      tzDisambigSide: null,
      place: { kind: "free" as const, label: "どこかの店" },
    };

    // 全員で割り勘: 対象の行は作らず、フラグだけが true。
    const all = await createExpense(sb, tripId, {
      ...base,
      splitEveryone: true,
      splitMemberIds: [],
    });
    expect(all.ok, JSON.stringify(all)).toBe(true);

    // 一部の人: フラグは false で、対象の行が入る。
    const some = await createExpense(sb, tripId, {
      ...base,
      note: "一部",
      splitEveryone: false,
      splitMemberIds: [me],
    });
    expect(some.ok, JSON.stringify(some)).toBe(true);

    const { data: rows } = await sb
      .from("expenses")
      .select("note, split_everyone, expense_splits(member_id)")
      .eq("trip_id", tripId);
    const everyoneRow = (rows ?? []).find((r) => r.note === null);
    const customRow = (rows ?? []).find((r) => r.note === "一部");
    expect(everyoneRow?.split_everyone).toBe(true);
    expect(everyoneRow?.expense_splits ?? []).toHaveLength(0);
    expect(customRow?.split_everyone).toBe(false);
    expect(customRow?.expense_splits ?? []).toHaveLength(1);

    // 「一部の人」なのに誰も居ない、は作らせない（入口で弾く）。
    const empty = await createExpense(sb, tripId, {
      ...base,
      splitEveryone: false,
      splitMemberIds: [],
    });
    expect(empty.ok).toBe(false);

    const deleted = await deleteTrip(sb, tripId, userId);
    expect(deleted.ok, JSON.stringify(deleted)).toBe(true);
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
