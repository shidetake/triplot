import { describe, expect, it } from "vitest";

import { compareTripOrder, type TripOrderKey } from "./tripOrder";

const sorted = (ts: TripOrderKey[]) => [...ts].sort(compareTripOrder);

describe("compareTripOrder", () => {
  it("puts the trip that starts latest first", () => {
    expect(
      sorted([
        { start: "2026-01-10" },
        { start: "2026-09-01" },
        { start: "2025-04-28" },
      ]).map((t) => t.start),
    ).toEqual(["2026-09-01", "2026-01-10", "2025-04-28"]);
  });

  it("puts trips without dates last", () => {
    expect(
      sorted([
        { start: null, title: "未定" },
        { start: "2026-01-10", title: "冬" },
        { start: null, title: "未定2" },
      ]).map((t) => t.title),
    ).toEqual(["冬", "未定", "未定2"]);
  });

  it("breaks ties on the same start date by title", () => {
    expect(
      sorted([
        { start: "2026-01-10", title: "B" },
        { start: "2026-01-10", title: "A" },
      ]).map((t) => t.title),
    ).toEqual(["A", "B"]);
  });

  it("orders the same regardless of the input order", () => {
    const trips: TripOrderKey[] = [
      { start: "2026-09-01", title: "秋" },
      { start: null, title: "未定" },
      { start: "2026-01-10", title: "冬" },
    ];
    const forward = sorted(trips).map((t) => t.title);
    const backward = sorted([...trips].reverse()).map((t) => t.title);
    expect(backward).toEqual(forward);
  });
});
