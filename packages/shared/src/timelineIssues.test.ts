import { describe, expect, it } from "vitest";

import { buildTripTzTimeline, type ScheduleEvent } from "./schedule";
import {
  detectTimelineIssues,
  formatTzGroups,
  splitParticipants,
  transitConnectionIssues,
} from "./timelineIssues";

function ev(p: Partial<ScheduleEvent> & Pick<ScheduleEvent, "id">): ScheduleEvent {
  return {
    title: p.id,
    kind: "normal",
    allDay: false,
    startAt: "2026-05-01T09:00",
    endAt: null,
    startTz: null,
    endTz: null,
    tzDisambigTransitId: null,
    tzDisambigSide: null,
    startPlaceId: null,
    endPlaceId: null,
    visibility: "shared",
    note: null,
    needsReservation: false,
    reservationDone: false,
    participantsEveryone: true,
    participantMemberIds: [],
    ...p,
  };
}

const transit = (
  id: string,
  o: {
    departAt: string;
    arriveAt: string;
    departTz: string;
    arriveTz: string;
    riders?: string[];
  },
) =>
  ev({
    id,
    title: id,
    kind: "transit",
    startAt: o.departAt,
    endAt: o.arriveAt,
    startTz: o.departTz,
    endTz: o.arriveTz,
    participantsEveryone: !o.riders,
    participantMemberIds: o.riders ?? [],
  });

const MEMBERS = ["a", "b", "c"];
const TYO = "Asia/Tokyo";
const HNL = "Pacific/Honolulu";
const LAX = "America/Los_Angeles";

// A が先にホノルルへ、B・C は2日後に合流。帰りは全員一緒。
const out = transit("out-a", {
  departAt: "2026-04-27T19:10",
  arriveAt: "2026-04-27T08:30",
  departTz: TYO,
  arriveTz: HNL,
  riders: ["a"],
});
const join = transit("out-bc", {
  departAt: "2026-04-29T19:10",
  arriveAt: "2026-04-29T08:30",
  departTz: TYO,
  arriveTz: HNL,
  riders: ["b", "c"],
});
const back = transit("back", {
  departAt: "2026-05-03T12:00",
  arriveAt: "2026-05-04T16:00",
  departTz: HNL,
  arriveTz: TYO,
});

describe("判定1: 年表が繋がっていない", () => {
  it("正しく付いていれば何も出ない", () => {
    expect(detectTimelineIssues([out, join, back], MEMBERS, TYO)).toEqual([]);
  });

  it("合流をまたぐ移動を「全員」のままにすると、まだ合流していない人で捕まる", () => {
    // A だけがホノルル→LA へ寄る便を「全員」のままにした。B・C は東京にいる
    // のに年表がホノルル発になる。
    const detour = transit("hnl-lax", {
      departAt: "2026-04-28T10:00",
      arriveAt: "2026-04-28T18:00",
      departTz: HNL,
      arriveTz: LAX,
    });
    const laxBack = transit("lax-hnl", {
      departAt: "2026-04-30T10:00",
      arriveAt: "2026-04-30T13:00",
      departTz: LAX,
      arriveTz: HNL,
      riders: ["a"],
    });
    const issues = detectTimelineIssues(
      [out, detour, laxBack, join, back],
      MEMBERS,
      TYO,
    );
    const disc = issues.filter((i) => i.kind === "disconnected");
    // B と C: 東京から乗れないはずの hnl-lax が前に無い（fallback の東京の
    // 後にいきなりホノルル発）→ 前と繋がらない、は「最初の移動」なので対象外。
    // 捕まるのは hnl-lax（LA 着）→ out-bc（東京発）。
    expect(disc.map((d) => [d.memberId, d.prev.id, d.next.id])).toEqual([
      ["b", "hnl-lax", "out-bc"],
      ["c", "hnl-lax", "out-bc"],
    ]);
    expect(disc[0]).toMatchObject({
      prev: { title: "hnl-lax", arriveTz: LAX },
      next: { title: "out-bc", departTz: TYO },
    });
  });

  it("自分だけの移動を付け忘れた人は、その先で繋がらなくなる", () => {
    // A のホノルル→LA の往路だけ入れて復路を入れ忘れた。帰国便はホノルル発
    // なので A の年表は LA 着 → ホノルル発で切れる。
    const detour = transit("hnl-lax", {
      departAt: "2026-04-28T10:00",
      arriveAt: "2026-04-28T18:00",
      departTz: HNL,
      arriveTz: LAX,
      riders: ["a"],
    });
    const issues = detectTimelineIssues([out, detour, join, back], MEMBERS, TYO);
    expect(
      issues.map((i) => (i.kind === "disconnected" ? [i.memberId, i.prev.id, i.next.id] : i.kind)),
    ).toEqual([["a", "hnl-lax", "back"]]);
  });
});

describe("判定2: 同じ予定に、その時刻に違う時間帯にいる人が入っている", () => {
  const tl = buildTripTzTimeline([out, join, back], TYO);

  it("A がホノルル、B・C が東京にいる日の「全員」の夕食で捕まる", () => {
    const dinner = ev({
      id: "dinner",
      title: "夕食",
      startAt: "2026-04-28T19:00",
    });
    const issues = detectTimelineIssues([out, join, back, dinner], MEMBERS, TYO);
    expect(issues).toEqual([
      {
        kind: "split",
        eventId: "dinner",
        title: "夕食",
        groups: [
          { tz: HNL, memberIds: ["a"] },
          { tz: TYO, memberIds: ["b", "c"] },
        ],
      },
    ]);
  });

  it("参加者を A だけにすれば出ない", () => {
    const dinner = ev({
      id: "dinner",
      startAt: "2026-04-28T19:00",
      participantsEveryone: false,
      participantMemberIds: ["a"],
    });
    expect(detectTimelineIssues([out, join, back, dinner], MEMBERS, TYO)).toEqual([]);
  });

  it("全員が揃った後の予定は出ない", () => {
    const lunch = ev({ id: "lunch", startAt: "2026-05-01T12:00" });
    expect(detectTimelineIssues([out, join, back, lunch], MEMBERS, TYO)).toEqual([]);
  });

  it("移動日の予定は、乗る人には予定の側の選択、乗らない人には自分の年表が効く", () => {
    // 4/29 は B・C の移動日。予定は「到着側（ホノルル）」を選んでいる。
    // A は既にホノルル。全員ホノルルなので食い違いは無い。
    const dinner = ev({
      id: "dinner",
      startAt: "2026-04-29T19:00",
      tzDisambigTransitId: "out-bc",
      tzDisambigSide: "arrive",
    });
    expect(splitParticipants(tl, MEMBERS, { date: "2026-04-29", time: "19:00" }, {
      transitId: "out-bc",
      side: "arrive",
    })).toBeNull();
    expect(detectTimelineIssues([out, join, back, dinner], MEMBERS, TYO)).toEqual([]);
  });

  it("移動日に決められない人は数えない（時刻が無い終日の予定）", () => {
    // 4/29 の終日の予定。B・C はその日どちら側か決まらないので除外され、
    // A（ホノルル）だけが残る＝食い違いは無い。
    const stay = ev({
      id: "stay",
      allDay: true,
      startAt: "2026-04-29T00:00",
      endAt: "2026-04-29T00:00",
    });
    expect(detectTimelineIssues([out, join, back, stay], MEMBERS, TYO)).toEqual([]);
  });

  it("移動日でも時刻で片側に絞れれば数える", () => {
    // 4/29 の 08:00 はホノルル着（08:30）より前なので到着側では成立せず、
    // B・C は東京側に決まる（09:00 だとどちらでも成立して絞れない）。
    expect(
      splitParticipants(tl, MEMBERS, { date: "2026-04-29", time: "08:00" }, null),
    ).toEqual([
      { tz: HNL, memberIds: ["a"] },
      { tz: TYO, memberIds: ["b", "c"] },
    ]);
  });

  it("1人だけの予定は対象外", () => {
    const solo = ev({
      id: "solo",
      startAt: "2026-04-28T19:00",
      participantsEveryone: false,
      participantMemberIds: ["b"],
    });
    expect(detectTimelineIssues([out, join, back, solo], MEMBERS, TYO)).toEqual([]);
  });
});

describe("transitConnectionIssues: 組み立て中の移動が年表を断ち切るか", () => {
  const tl = buildTripTzTimeline([out, join, back], TYO);

  it("繋がる移動なら空", () => {
    expect(
      transitConnectionIssues(
        tl,
        {
          transitId: "new",
          departAt: "2026-05-01T10:00",
          arriveAt: "2026-05-01T18:00",
          departTz: HNL,
          arriveTz: LAX,
          participantsEveryone: false,
          participantMemberIds: ["a"],
        },
        MEMBERS,
      ),
      // A: ホノルル着 → ホノルル発 は繋がる。ただし後ろの帰国便（ホノルル発）
      // とは繋がらない。
    ).toEqual([{ memberId: "a", side: "after", tz: HNL }]);
  });

  it("まだ合流していない人を「全員」で乗せると、その人の前が繋がらない", () => {
    expect(
      transitConnectionIssues(
        tl,
        {
          transitId: "new",
          departAt: "2026-04-28T10:00",
          arriveAt: "2026-04-28T13:00",
          departTz: HNL,
          arriveTz: "Pacific/Tahiti",
          participantsEveryone: true,
          participantMemberIds: [],
        },
        MEMBERS,
      ),
    ).toEqual([
      // A はホノルル着の後なので前は繋がる。後ろは B・C の合流便ではなく
      // 帰国便（ホノルル発）で、タヒチ着とは繋がらない。
      { memberId: "a", side: "after", tz: HNL },
      // B・C は最初の移動がこれになる（前は無い）。後ろの out-bc（東京発）
      // とタヒチ着が繋がらない。
      { memberId: "b", side: "after", tz: TYO },
      { memberId: "c", side: "after", tz: TYO },
    ]);
  });

  it("編集中の移動は同じ id を差し替えて判定する", () => {
    // out-a を「全員」に変えると、B・C は out-bc（東京発）と繋がらなくなる。
    expect(
      transitConnectionIssues(
        tl,
        {
          transitId: "out-a",
          departAt: "2026-04-27T19:10",
          arriveAt: "2026-04-27T08:30",
          departTz: TYO,
          arriveTz: HNL,
          participantsEveryone: true,
          participantMemberIds: [],
        },
        MEMBERS,
      ),
    ).toEqual([
      { memberId: "b", side: "after", tz: TYO },
      { memberId: "c", side: "after", tz: TYO },
    ]);
  });

  it("時差の無い移動は年表に入らないので何も出ない", () => {
    expect(
      transitConnectionIssues(
        tl,
        {
          transitId: "uber",
          departAt: "2026-04-28T10:00",
          arriveAt: "2026-04-28T10:30",
          departTz: HNL,
          arriveTz: HNL,
          participantsEveryone: true,
          participantMemberIds: [],
        },
        MEMBERS,
      ),
    ).toEqual([]);
  });
});

describe("formatTzGroups", () => {
  const groups = [
    { tz: HNL, memberIds: ["a"] },
    { tz: TYO, memberIds: ["b", "c"] },
  ];
  const opts = {
    tzLabel: (tz: string) => (tz === HNL ? "ハワイ" : "日本"),
    memberName: (id: string) => id.toUpperCase(),
  };
  it("ja は「・」で人を繋ぐ", () => {
    expect(formatTzGroups(groups, { ...opts, locale: "ja" })).toBe(
      "ハワイ: A / 日本: B・C",
    );
  });
  it("en はカンマ", () => {
    expect(formatTzGroups(groups, { ...opts, locale: "en" })).toBe(
      "ハワイ: A / 日本: B, C",
    );
  });
});
