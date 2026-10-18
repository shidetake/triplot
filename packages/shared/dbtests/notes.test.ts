import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deleteAccount } from "../src/data/account";
import type { DB } from "../src/data/client";
import { ensureTripInvite, joinTripViaInvite } from "../src/data/invites";
import {
  acquireNoteLock,
  createNote,
  deleteNoteReturning,
  releaseNoteLock,
  renewNoteLock,
  restoreNote,
  saveNote,
} from "../src/data/notes";
import { createTrip, deleteTrip } from "../src/data/trips";

import { DBTEST_PREFIX, dbTestEnv, signIn, signInAsGuest } from "./helpers";

// ノートの期限付きロックが、2人のあいだで決めたとおりに働くか。ロックは
// DB の関数の中でしか判定していないので、実 DB でしか確かめられない。

const env = dbTestEnv();
const describeDb = env ? describe : describe.skip;

describeDb("ノートのロック（実 DB）", () => {
  let sb: DB;
  let userId: string;
  let guest: { sb: DB; userId: string } | null = null;
  let tripId: string | null = null;

  beforeAll(async () => {
    ({ sb, userId } = await signIn(env!));
  });

  afterAll(async () => {
    if (tripId) await deleteTrip(sb, tripId, userId);
    if (guest) await deleteAccount(guest.sb, guest.userId);
  });

  it("編集中は他の人が取れず、期限の印が変わった保存は通らない", async () => {
    const created = await createTrip(sb, {
      title: `${DBTEST_PREFIX}note-${Date.now()}`,
      startDate: "2027-09-01",
      endDate: "2027-09-03",
      displayName: "dbtest",
      currency: "JPY",
      clientTz: "Asia/Tokyo",
    });
    expect(created.ok, JSON.stringify(created)).toBe(true);
    if (!created.ok) return;
    tripId = created.data.tripId;

    const invite = await ensureTripInvite(sb, tripId, `dbtest-${Date.now()}`);
    expect(invite.ok, JSON.stringify(invite)).toBe(true);
    if (!invite.ok) return;
    guest = await signInAsGuest(env!);
    const joined = await joinTripViaInvite(guest.sb, invite.data.token, "相方");
    expect(joined.ok, JSON.stringify(joined)).toBe(true);

    const made = await createNote(sb, tripId, "ヨセミテ\nhttps://www.nps.gov/yose/", "shared");
    expect(made.ok, JSON.stringify(made)).toBe(true);
    if (!made.ok) return;
    const noteId = made.data;

    // 自分が取る → 相手は取れず、自分が持っていると返る。相手は消せもしない。
    const mine = await acquireNoteLock(sb, noteId);
    expect(mine.ok && mine.data.ok, JSON.stringify(mine)).toBe(true);
    if (!mine.ok || !mine.data.ok) return;
    const theirs = await acquireNoteLock(guest.sb, noteId);
    expect(theirs.ok && !theirs.data.ok, JSON.stringify(theirs)).toBe(true);
    expect((await deleteNoteReturning(guest.sb, noteId)).ok).toBe(false);
    expect((await renewNoteLock(sb, noteId, mine.data.token)).ok).toBe(true);

    // 保存すると外れる → 相手が取れる。
    const saved = await saveNote(sb, noteId, mine.data.token, "ヨセミテ\n行き方", "shared");
    expect(saved.ok && saved.data, JSON.stringify(saved)).toBe(true);
    const next = await acquireNoteLock(guest.sb, noteId);
    expect(next.ok && next.data.ok, JSON.stringify(next)).toBe(true);
    if (!next.ok || !next.data.ok) return;
    expect(next.data.body).toBe("ヨセミテ\n行き方");

    // 古い印での保存・延長は通らない（何も書かない）。
    expect(await saveNote(sb, noteId, mine.data.token, "上書き", "shared")).toEqual({
      ok: true,
      data: false,
    });
    expect(await renewNoteLock(sb, noteId, mine.data.token)).toEqual({
      ok: true,
      data: false,
    });

    // 作った人でない相手は、自分だけにはできない。
    expect(
      (await saveNote(guest.sb, noteId, next.data.token, "x", "private")).ok,
    ).toBe(false);
    await releaseNoteLock(guest.sb, noteId, next.data.token);

    // 消して戻せる。
    const snap = await deleteNoteReturning(sb, noteId);
    expect(snap.ok, JSON.stringify(snap)).toBe(true);
    if (!snap.ok) return;
    expect((await restoreNote(sb, snap.data)).ok).toBe(true);
    const { data: back } = await sb
      .from("notes")
      .select("body, locked_by_member_id")
      .eq("id", noteId)
      .single();
    expect(back).toEqual({ body: "ヨセミテ\n行き方", locked_by_member_id: null });
  });
});
