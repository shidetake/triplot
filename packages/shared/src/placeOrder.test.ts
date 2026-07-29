import { describe, expect, it } from "vitest";

import {
  earliestVisitByPlace,
  sortPlacesByItinerary,
  type OrderableEvent,
  type OrderableExpense,
  type OrderablePlace,
} from "./placeOrder";
import type { TripTzTimeline } from "./schedule";

// transit が無い旅行＝全日程が既定TZ。大半のケースはこれで足りる。
const TOKYO: TripTzTimeline = { fallbackTz: "Asia/Tokyo", transits: [] };

// 日本 → ハワイの片道。4/28 に飛んで以降はホノルル時間になる。
const TO_HAWAII: TripTzTimeline = {
  fallbackTz: "Asia/Tokyo",
  transits: [
    {
      transitId: "t1",
      departDate: "2026-04-28",
      arriveDate: "2026-04-28",
      departTz: "Asia/Tokyo",
      arriveTz: "Pacific/Honolulu",
    },
  ],
};

function place(
  id: string,
  over: Partial<OrderablePlace> = {},
): OrderablePlace {
  return {
    id,
    lat: 35,
    lng: 139,
    tentative: false,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function event(placeId: string | null, startAt: string): OrderableEvent {
  return {
    kind: "normal",
    startAt,
    startTz: null,
    tzDisambigTransitId: null,
    tzDisambigSide: null,
    placeId,
  };
}

function expense(
  placeId: string | null,
  paidAt: string,
  tz = "Asia/Tokyo",
): OrderableExpense {
  return { place_id: placeId, paid_at: paidAt, tz };
}

const ids = (rows: OrderablePlace[]) => rows.map((p) => p.id);

describe("earliestVisitByPlace", () => {
  it("同じ場所に複数の予定があれば一番早い方を採る（複数回行く場所）", () => {
    const m = earliestVisitByPlace(
      [event("p", "2026-04-30T09:00"), event("p", "2026-04-28T09:00")],
      [],
      TOKYO,
    );
    expect(m.get("p")).toBe(Date.parse("2026-04-28T09:00+09:00"));
  });

  it("予定と費用の両方にあれば早い方が勝つ", () => {
    const m = earliestVisitByPlace(
      [event("p", "2026-04-30T09:00")],
      [expense("p", "2026-04-28T12:00")],
      TOKYO,
    );
    expect(m.get("p")).toBe(Date.parse("2026-04-28T12:00+09:00"));
  });

  it("費用しか無くても日時が付く", () => {
    const m = earliestVisitByPlace([], [expense("p", "2026-05-02T20:00")], TOKYO);
    expect(m.get("p")).toBe(Date.parse("2026-05-02T20:00+09:00"));
  });

  it("場所に紐づかない予定・費用は無視する", () => {
    const m = earliestVisitByPlace(
      [event(null, "2026-04-28T09:00")],
      [expense(null, "2026-04-28T09:00")],
      TOKYO,
    );
    expect(m.size).toBe(0);
  });

  it("壁時計が同じでもTZが違えば絶対時刻で比べる", () => {
    // 4/28 の乗継以降はホノルル。壁時計 10:00 は東京の 10:00 より後。
    const m = earliestVisitByPlace(
      [event("tokyo", "2026-04-27T10:00"), event("hnl", "2026-04-29T10:00")],
      [],
      TO_HAWAII,
    );
    expect(m.get("tokyo")).toBe(Date.parse("2026-04-27T10:00+09:00"));
    expect(m.get("hnl")).toBe(Date.parse("2026-04-29T10:00-10:00"));
    expect(m.get("tokyo")!).toBeLessThan(m.get("hnl")!);
  });

  it("transit は startTz をそのまま使う（旅程から引き直さない）", () => {
    const transit: OrderableEvent = {
      kind: "transit",
      startAt: "2026-04-28T18:00",
      startTz: "Asia/Tokyo",
      tzDisambigTransitId: null,
      tzDisambigSide: null,
      placeId: "hnd",
    };
    const m = earliestVisitByPlace([transit], [], TO_HAWAII);
    expect(m.get("hnd")).toBe(Date.parse("2026-04-28T18:00+09:00"));
  });
});

describe("sortPlacesByItinerary", () => {
  it("日時のある確定場所は訪問順に並ぶ", () => {
    const places = [place("c"), place("a"), place("b")];
    const events = [
      event("a", "2026-04-28T10:00"),
      event("b", "2026-04-29T10:00"),
      event("c", "2026-04-30T10:00"),
    ];
    expect(ids(sortPlacesByItinerary(places, events, [], TOKYO))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("群の順序: 地図未登録 → 訪問順 → 日時なし → 候補", () => {
    const places = [
      place("cand", { tentative: true }),
      place("dated", {}),
      place("undated", {}),
      place("unpinned", { lat: null, lng: null }),
    ];
    const events = [event("dated", "2026-04-28T10:00")];
    expect(ids(sortPlacesByItinerary(places, events, [], TOKYO))).toEqual([
      "unpinned",
      "dated",
      "undated",
      "cand",
    ]);
  });

  it("候補は日時があっても最下部（確定より下）", () => {
    const places = [
      place("cand", { tentative: true }),
      place("undated", {}),
    ];
    // 候補にだけ早い日時が付いていても順序は変わらない。
    const events = [event("cand", "2026-04-01T10:00")];
    expect(ids(sortPlacesByItinerary(places, events, [], TOKYO))).toEqual([
      "undated",
      "cand",
    ]);
  });

  it("ピン未設定の候補は候補群の中で先頭（確定群には割り込まない）", () => {
    const places = [
      place("cand", { tentative: true }),
      place("candUnpinned", { tentative: true, lat: null, lng: null }),
      place("confirmed", {}),
    ];
    expect(ids(sortPlacesByItinerary(places, [], [], TOKYO))).toEqual([
      "confirmed",
      "candUnpinned",
      "cand",
    ]);
  });

  it("費用だけ紐づく場所も訪問順に混ざる", () => {
    const places = [place("a"), place("b"), place("c")];
    const events = [event("a", "2026-04-28T10:00"), event("c", "2026-04-30T10:00")];
    const expenses = [expense("b", "2026-04-29T10:00")];
    expect(ids(sortPlacesByItinerary(places, events, expenses, TOKYO))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("同順位は created_at の新しい順（並び替え導入前の既定順を踏襲）", () => {
    const places = [
      place("old", { created_at: "2026-01-01T00:00:00Z" }),
      place("new", { created_at: "2026-03-01T00:00:00Z" }),
      place("mid", { created_at: "2026-02-01T00:00:00Z" }),
    ];
    expect(ids(sortPlacesByItinerary(places, [], [], TOKYO))).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  it("同時刻でも created_at で安定する", () => {
    const places = [
      place("old", { created_at: "2026-01-01T00:00:00Z" }),
      place("new", { created_at: "2026-02-01T00:00:00Z" }),
    ];
    const events = [
      event("old", "2026-04-28T10:00"),
      event("new", "2026-04-28T10:00"),
    ];
    expect(ids(sortPlacesByItinerary(places, events, [], TOKYO))).toEqual([
      "new",
      "old",
    ]);
  });

  it("入力配列を破壊しない", () => {
    const places = [place("b"), place("a")];
    const before = ids(places);
    sortPlacesByItinerary(places, [event("a", "2026-04-28T10:00")], [], TOKYO);
    expect(ids(places)).toEqual(before);
  });

  it("空でも落ちない", () => {
    expect(sortPlacesByItinerary([], [], [], TOKYO)).toEqual([]);
  });
});
