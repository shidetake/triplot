import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DB } from "../src/data/client";
import { createExpense } from "../src/data/expenses";
import {
  createGuestUpgradeTicket,
  redeemGuestUpgradeTicket,
} from "../src/data/guestUpgrade";
import { ensureTripInvite, joinTripViaInvite } from "../src/data/invites";
import { createTrip, deleteTrip } from "../src/data/trips";

import { DBTEST_PREFIX, dbTestEnv, signIn, signInAsGuest } from "./helpers";

// ゲスト（匿名サインイン）から本アカウントへの昇格。
//
// 実 DB でしか出ない壊れ方を捕まえるのが目的:
//   - trip_members を参照する外部キーは 8 本が ON DELETE CASCADE なので、
//     順序を間違えると書き込みが道連れで消える
//   - expense_splits / event_participants / todo_likes は (親id, member_id) が
//     複合主キーなので、同じ旅行に2行ある状態で寄せると一意制約に当たる
//   - trip_members は (trip_id, user_id) が一意なので、同じ旅行に2行は置けない
//
// 見るのは「引き取った後にメンバーが1人になり、書いたものが残っているか」だけ。
// 中間状態は追わない（落ちた時に原因を追いやすくするため）。

const env = dbTestEnv();
const describeDb = env ? describe : describe.skip;

if (!env) {
  console.warn(
    "[dbtests] apps/web/.env.development.local が無いのでスキップ。" +
      " staging の URL/anon key と開発用ログインの資格情報が要る。",
  );
}

describeDb("ゲストからの昇格（実 DB）", () => {
  let sb: DB;
  let userId: string;

  beforeAll(async () => {
    ({ sb, userId } = await signIn(env!));
    await sweepLeftovers(sb, userId);
  });

  afterAll(async () => {
    if (sb) await sweepLeftovers(sb, userId);
  });

  it("ゲストが書いたものを、そのまま引き継げる", async () => {
    const { tripId, token } = await makeTripWithInvite(sb, userId);

    // ゲストとして参加して費用を書く。
    const guest = await signInAsGuest(env!);
    const joined = await joinTripViaInvite(guest.sb, token, "ゲストの名前");
    expect(joined.ok, JSON.stringify(joined)).toBe(true);

    const guestMemberId = await memberIdOf(sb, tripId, guest.userId);
    const spent = await createExpense(guest.sb, tripId, {
      ...(await expenseBase(sb, tripId, guestMemberId)),
      splitEveryone: true,
      splitMemberIds: [],
    });
    expect(spent.ok, JSON.stringify(spent)).toBe(true);

    // 昇格。券はゲストのうちに取り、サインイン後（= 本アカウントの sb）に引き換える。
    const ticket = await createGuestUpgradeTicket(guest.sb);
    expect(ticket.ok, JSON.stringify(ticket)).toBe(true);
    if (!ticket.ok) return;

    const redeemed = await redeemGuestUpgradeTicket(sb, ticket.data.token);
    expect(redeemed.ok, JSON.stringify(redeemed)).toBe(true);

    // メンバー行は移っただけ。表示名と色はゲスト時代のまま、費用も残っている。
    const members = await activeMembers(sb, tripId);
    expect(members).toHaveLength(2); // 旅行の作成者＋引き取ったメンバー
    const mine = members.find((m) => m.id === guestMemberId);
    expect(mine?.user_id).toBe(userId);
    expect(mine?.display_name).toBe("ゲストの名前");
    expect(mine?.kind).toBe("member");
    expect(await expenseCount(sb, tripId, guestMemberId)).toBe(1);

    const deleted = await deleteTrip(sb, tripId, userId);
    expect(deleted.ok, JSON.stringify(deleted)).toBe(true);
  });

  it("同じ旅行に本アカウントでも参加済みなら、1人にまとまる", async () => {
    // 旅行の作成者とは別の人が招待を受ける形にしないと「同じ旅行に2行」を
    // 作れないので、ここでは作成者自身がゲストとしても参加した形を作る。
    const { tripId, token } = await makeTripWithInvite(sb, userId);
    const myMemberId = await memberIdOf(sb, tripId, userId);

    const guest = await signInAsGuest(env!);
    const joined = await joinTripViaInvite(guest.sb, token, "ゲストの名前");
    expect(joined.ok, JSON.stringify(joined)).toBe(true);
    const guestMemberId = await memberIdOf(sb, tripId, guest.userId);

    // 両方の行に費用をぶら下げておく（付け替え漏れがあれば消える）。
    const guestSpent = await createExpense(guest.sb, tripId, {
      ...(await expenseBase(sb, tripId, guestMemberId)),
      splitEveryone: true,
      splitMemberIds: [],
    });
    expect(guestSpent.ok, JSON.stringify(guestSpent)).toBe(true);
    const mySpent = await createExpense(sb, tripId, {
      ...(await expenseBase(sb, tripId, myMemberId)),
      splitEveryone: true,
      splitMemberIds: [],
    });
    expect(mySpent.ok, JSON.stringify(mySpent)).toBe(true);

    const ticket = await createGuestUpgradeTicket(guest.sb);
    expect(ticket.ok, JSON.stringify(ticket)).toBe(true);
    if (!ticket.ok) return;
    const redeemed = await redeemGuestUpgradeTicket(sb, ticket.data.token);
    expect(redeemed.ok, JSON.stringify(redeemed)).toBe(true);

    // 2行が1行にまとまり、残るのはゲスト側（表示名と色をそちらに寄せる方針）。
    const members = await activeMembers(sb, tripId);
    expect(members).toHaveLength(1);
    expect(members[0]?.id).toBe(guestMemberId);
    expect(members[0]?.user_id).toBe(userId);
    expect(members[0]?.display_name).toBe("ゲストの名前");
    // 管理者はどちらかが持っていれば引き継ぐ（旅行の作成者だったので true）。
    expect(members[0]?.is_admin).toBe(true);
    // 両方の費用が残り、付け替えられている。
    expect(await expenseCount(sb, tripId, guestMemberId)).toBe(2);

    const deleted = await deleteTrip(sb, tripId, userId);
    expect(deleted.ok, JSON.stringify(deleted)).toBe(true);
  });
});

async function makeTripWithInvite(sb: DB, userId: string) {
  const created = await createTrip(sb, {
    title: `${DBTEST_PREFIX}${Date.now()}`,
    startDate: "2027-06-01",
    endDate: "2027-06-05",
    displayName: "dbtest",
    currency: "JPY",
    clientTz: "Asia/Tokyo",
  });
  if (!created.ok) throw new Error(`旅行を作れない: ${created.error}`);
  const tripId = created.data.tripId;
  await memberIdOf(sb, tripId, userId);
  const invite = await ensureTripInvite(sb, tripId, `dbtest-${Date.now()}`);
  if (!invite.ok) throw new Error(`招待リンクを作れない: ${invite.error}`);
  return { tripId, token: invite.data.token };
}

async function expenseBase(sb: DB, tripId: string, payerMemberId: string) {
  const { data } = await sb
    .from("expense_categories")
    .select("id")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("既定の費用カテゴリが seed されていない");
  return {
    localPrice: 1000,
    localCurrency: "JPY" as const,
    rateToDefault: 1,
    categoryId: data.id,
    payerMemberId,
    visibility: "shared" as const,
    splittable: true,
    note: "",
    paidAt: "2027-06-02",
    tzDisambigTransitId: null,
    tzDisambigSide: null,
    place: { kind: "free" as const, label: "どこかの店" },
  };
}

async function memberIdOf(sb: DB, tripId: string, userId: string) {
  const { data } = await sb
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .single();
  if (!data) throw new Error("メンバー行が無い");
  return data.id;
}

async function activeMembers(sb: DB, tripId: string) {
  const { data } = await sb
    .from("trip_members")
    .select("id, user_id, display_name, kind, is_admin")
    .eq("trip_id", tripId)
    .is("left_at", null);
  return data ?? [];
}

async function expenseCount(sb: DB, tripId: string, memberId: string) {
  const { data } = await sb
    .from("expenses")
    .select("id")
    .eq("trip_id", tripId)
    .eq("payer_member_id", memberId);
  return (data ?? []).length;
}

// 前回落ちて消せなかったぶんを消す。**接頭辞が付いた自分の旅行だけ**が対象。
async function sweepLeftovers(sb: DB, userId: string) {
  const { data } = await sb
    .from("trips")
    .select("id, title")
    .like("title", `${DBTEST_PREFIX}%`);
  for (const t of data ?? []) await deleteTrip(sb, t.id, userId);
}
