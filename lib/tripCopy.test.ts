import { describe, it, expect } from "vitest";

import {
  addDays,
  dayCountBetween,
  mapTripDays,
  remapEventDate,
  tripDayCount,
} from "./tripCopy";

describe("dayCountBetween / addDays / tripDayCount", () => {
  it("日数差を出す（両端で月をまたいでも）", () => {
    expect(dayCountBetween("2026-05-01", "2026-05-05")).toBe(4);
    expect(dayCountBetween("2026-05-31", "2026-06-01")).toBe(1);
    expect(dayCountBetween("2026-05-05", "2026-05-01")).toBe(-4);
  });

  it("addDays は月またぎ・うるう年でも正しい", () => {
    expect(addDays("2026-05-31", 1)).toBe("2026-06-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29"); // うるう年
    expect(addDays("2026-05-01", -1)).toBe("2026-04-30");
  });

  it("tripDayCount は両端含む（1日旅行=1）", () => {
    expect(tripDayCount("2026-05-01", "2026-05-01")).toBe(1);
    expect(tripDayCount("2026-05-01", "2026-05-05")).toBe(5);
  });
});

describe("mapTripDays", () => {
  it("同じ日数は 1:1", () => {
    expect(mapTripDays(5, 5)).toEqual([0, 1, 2, 3, 4]);
  });

  it("短くなる: 両端を残し真ん中を潰す（5→3）", () => {
    // 前2・後1を残す。中日 index 2,3 を破棄。
    expect(mapTripDays(5, 3)).toEqual([0, 1, null, null, 2]);
  });

  it("長くなる: 両端に寄せ真ん中を空ける（3→5）", () => {
    // 新 index 2,3 が空き。元 day2 は新 day4 へ。
    expect(mapTripDays(3, 5)).toEqual([0, 1, 4]);
  });

  it("1日に潰す（4→1）は先頭だけ残る", () => {
    // keep=1, front=1, back=0
    expect(mapTripDays(4, 1)).toEqual([0, null, null, null]);
  });

  it("1日から伸ばす（1→4）は先頭に置く", () => {
    expect(mapTripDays(1, 4)).toEqual([0]);
  });

  it("偶数で短縮（6→4）も両端優先", () => {
    // keep=4, front=2, back=2 → 中日 index 2,3 破棄
    expect(mapTripDays(6, 4)).toEqual([0, 1, null, null, 2, 3]);
  });
});

describe("remapEventDate", () => {
  const srcStart = "2026-05-01";

  it("同日数なら時刻そのままで新開始日へ平行移動", () => {
    const map = mapTripDays(5, 5);
    const r = remapEventDate(
      { startAt: "2026-05-03T09:00:00", endAt: "2026-05-03T10:30:00" },
      srcStart,
      "2026-07-10",
      map,
    );
    // 元 day2 → 新 day2 = 2026-07-12
    expect(r).toEqual({
      startAt: "2026-07-12T09:00:00",
      endAt: "2026-07-12T10:30:00",
    });
  });

  it("潰された中日の予定は破棄（null）", () => {
    const map = mapTripDays(5, 3); // [0,1,null,null,2]
    const r = remapEventDate(
      { startAt: "2026-05-03T09:00:00", endAt: null }, // day2 = 破棄
      srcStart,
      "2026-07-10",
      map,
    );
    expect(r).toBeNull();
  });

  it("後半に残る日は末尾揃えでシフト（5→3 の day4）", () => {
    const map = mapTripDays(5, 3); // day4 → 新 day2
    const r = remapEventDate(
      { startAt: "2026-05-05T20:00:00", endAt: null },
      srcStart,
      "2026-07-10",
      map,
    );
    // 新 day2 = 2026-07-12
    expect(r).toEqual({ startAt: "2026-07-12T20:00:00", endAt: null });
  });

  it("複数日にまたがる予定は期間（日数）を保つ", () => {
    const map = mapTripDays(5, 5);
    const r = remapEventDate(
      { startAt: "2026-05-02T23:00:00", endAt: "2026-05-04T01:00:00" },
      srcStart,
      "2026-07-10",
      map,
    );
    // day1 → 新 day1 = 07-11、終了は同じ +2 日シフトで 07-13
    expect(r).toEqual({
      startAt: "2026-07-11T23:00:00",
      endAt: "2026-07-13T01:00:00",
    });
  });

  it("範囲外の開始日は破棄", () => {
    const map = mapTripDays(5, 5);
    expect(
      remapEventDate(
        { startAt: "2026-04-30T09:00:00", endAt: null },
        srcStart,
        "2026-07-10",
        map,
      ),
    ).toBeNull();
  });

  it("秒なしの壁時計（分まで）も時刻部を保つ", () => {
    const map = mapTripDays(5, 5);
    const r = remapEventDate(
      { startAt: "2026-05-01T08:15", endAt: null },
      srcStart,
      "2026-07-10",
      map,
    );
    expect(r).toEqual({ startAt: "2026-07-10T08:15", endAt: null });
  });
});
