import { describe, expect, it } from "vitest";

import { guessTripForReceipt, tripMatchDate, type TripRange } from "./tripMatch";

const tripA: TripRange = { id: "A", startDate: "2026-05-01", endDate: "2026-05-07" };
const tripB: TripRange = { id: "B", startDate: "2026-08-10", endDate: "2026-08-15" };
const trips = [tripA, tripB];

describe("tripMatchDate", () => {
  it("serviceDate があれば優先", () => {
    expect(tripMatchDate({ date: "2026-05-03", serviceDate: "2026-08-11" })).toBe(
      "2026-08-11",
    );
  });
  it("serviceDate が null/空なら購入日", () => {
    expect(tripMatchDate({ date: "2026-05-03", serviceDate: null })).toBe(
      "2026-05-03",
    );
    expect(tripMatchDate({ date: "2026-05-03", serviceDate: "  " })).toBe(
      "2026-05-03",
    );
  });
});

describe("guessTripForReceipt", () => {
  it("旅行中の店頭購入は購入日でその旅行に入る", () => {
    const g = guessTripForReceipt({ date: "2026-05-03", serviceDate: null }, trips);
    expect(g).toEqual({ date: "2026-05-03", basis: "purchase", tripIds: ["A"] });
  });

  it("旅行A中に買った旅行Bの航空券は serviceDate で B に推測", () => {
    // 購入日は A の日程内だが、搭乗日は B の日程内
    const g = guessTripForReceipt(
      { date: "2026-05-03", serviceDate: "2026-08-11" },
      trips,
    );
    expect(g.basis).toBe("service");
    expect(g.tripIds).toEqual(["B"]);
  });

  it("どの旅程にも入らなければ空（要割当）", () => {
    const g = guessTripForReceipt({ date: "2026-06-20", serviceDate: null }, trips);
    expect(g.tripIds).toEqual([]);
  });

  it("日程が重なる旅行は複数候補（要確認）", () => {
    const overlap = [
      tripA,
      { id: "C", startDate: "2026-05-05", endDate: "2026-05-10" },
    ];
    const g = guessTripForReceipt({ date: "2026-05-06", serviceDate: null }, overlap);
    expect(g.tripIds.sort()).toEqual(["A", "C"]);
  });

  it("日程未設定の旅行は対象外", () => {
    const g = guessTripForReceipt(
      { date: "2026-05-03", serviceDate: null },
      [{ id: "X", startDate: null, endDate: null }],
    );
    expect(g.tripIds).toEqual([]);
  });
});
