import { describe, expect, it } from "vitest";

import {
  areaFilterOptions,
  dayFilterOptions,
  matchesPlaceFilter,
} from "./placeFilter";
import type { VisitDay } from "./placeOrder";

describe("areaFilterOptions", () => {
  it("旅程順（最初に訪れるのが早いエリアが先）に並べる", () => {
    const area = new Map<string, string | null>([
      ["narita", "千葉県"],
      ["ala", "ホノルル"],
      ["waikiki", "ホノルル"],
      ["diamond", "ホノルル"],
    ]);
    const earliest = new Map([
      ["narita", 1000],
      ["ala", 5000],
      ["waikiki", 6000],
      ["diamond", 7000],
    ]);
    // 件数はホノルルが多いが、先に訪れる千葉県が先頭に来る。
    expect(areaFilterOptions(area, earliest)).toEqual([
      { label: "千葉県", count: 1 },
      { label: "ホノルル", count: 3 },
    ]);
  });

  it("日時の分からないエリア同士は件数の多い順", () => {
    const area = new Map<string, string | null>([
      ["a", "X"],
      ["b", "Y"],
      ["c", "Y"],
    ]);
    expect(areaFilterOptions(area, new Map())).toEqual([
      { label: "Y", count: 2 },
      { label: "X", count: 1 },
    ]);
  });

  it("ラベル無し（その他）も1つの選択肢として数える", () => {
    const area = new Map<string, string | null>([
      ["a", null],
      ["b", null],
    ]);
    expect(areaFilterOptions(area, new Map())).toEqual([
      { label: null, count: 2 },
    ]);
  });
});

describe("dayFilterOptions", () => {
  const day = (dayIndex: number, date: string): VisitDay => ({
    dayIndex,
    date,
  });

  it("旅程順（dayIndex 昇順）に、日ごとの件数付きで返す", () => {
    const byPlace = new Map([
      ["a", day(2, "2026-08-02")],
      ["b", day(1, "2026-08-01")],
      ["c", day(2, "2026-08-02")],
    ]);
    expect(dayFilterOptions(byPlace)).toEqual([
      { dayIndex: 1, date: "2026-08-01", count: 1 },
      { dayIndex: 2, date: "2026-08-02", count: 2 },
    ]);
  });

  it("日付の決まらない場所は選択肢に出ない（Map に入らない）", () => {
    expect(dayFilterOptions(new Map())).toEqual([]);
  });
});

describe("matchesPlaceFilter", () => {
  const area = new Map<string, string | null>([
    ["a", "ホノルル"],
    ["b", null],
  ]);
  const days = new Map([["a", { dayIndex: 1, date: "2026-08-01" }]]);

  it("エリアで絞る", () => {
    expect(
      matchesPlaceFilter("a", { kind: "area", label: "ホノルル" }, area, days),
    ).toBe(true);
    expect(
      matchesPlaceFilter("b", { kind: "area", label: "ホノルル" }, area, days),
    ).toBe(false);
  });

  it("ラベル無し（その他）も絞り込める", () => {
    expect(
      matchesPlaceFilter("b", { kind: "area", label: null }, area, days),
    ).toBe(true);
  });

  it("日にちで絞る（日付の決まらない場所は外れる）", () => {
    expect(matchesPlaceFilter("a", { kind: "day", dayIndex: 1 }, area, days)).toBe(
      true,
    );
    expect(matchesPlaceFilter("b", { kind: "day", dayIndex: 1 }, area, days)).toBe(
      false,
    );
  });
});
