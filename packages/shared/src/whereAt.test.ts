import { describe, expect, it } from "vitest";

import { whereAt, type TransitLeg } from "./whereAt";

const NRT = { lat: 35.772, lng: 140.393 };
const HNL = { lat: 21.319, lng: -157.922 };
const ITO = { lat: 19.72, lng: -155.048 };

const JP = "Asia/Tokyo";
const HI = "Pacific/Honolulu";

// 成田 → ホノルル → ハワイ島。往路は日付変更線を跨ぐので、**壁時計のままだと
// 到着（4/28 07:25）が出発（4/28 19:10）より前に来る**。絶対時刻に直して
// 並べないと順序が壊れる。
const legs: TransitLeg[] = [
  {
    departAt: "2026-04-28T19:10",
    arriveAt: "2026-04-28T07:25",
    departTz: JP,
    arriveTz: HI,
    departPlace: NRT,
    arrivePlace: HNL,
  },
  {
    departAt: "2026-05-01T10:00",
    arriveAt: "2026-05-01T10:45",
    departTz: HI,
    arriveTz: HI,
    departPlace: HNL,
    arrivePlace: ITO,
  },
];

describe("whereAt", () => {
  it("最初の移動より前は出発地（成田の空港で食べた昼食）", () => {
    expect(whereAt(legs, { at: "2026-04-28T12:00", tz: JP })).toEqual(NRT);
  });

  it("到着後はその到着地（ホノルルの夕食）", () => {
    expect(whereAt(legs, { at: "2026-04-29T19:00", tz: HI })).toEqual(HNL);
  });

  it("到着した当日でも、到着より後ならホノルル（日付変更線を跨いでも壊れない）", () => {
    expect(whereAt(legs, { at: "2026-04-28T12:00", tz: HI })).toEqual(HNL);
  });

  it("次の移動の後はその到着地（ハワイ島のコーヒー）", () => {
    expect(whereAt(legs, { at: "2026-05-01T15:00", tz: HI })).toEqual(ITO);
  });

  it("移動の出発時刻ちょうどはまだ出発地", () => {
    expect(whereAt(legs, { at: "2026-05-01T10:00", tz: HI })).toEqual(HNL);
  });

  it("移動が無ければ null（呼び出し側が旅行のピンに落とす）", () => {
    expect(whereAt([], { at: "2026-04-29T19:00", tz: HI })).toBeNull();
  });

  it("座標を持たない移動は無視する", () => {
    expect(
      whereAt(
        [
          {
            departAt: "2026-04-28T19:10",
            arriveAt: "2026-04-28T07:25",
            departTz: JP,
            arriveTz: HI,
            departPlace: null,
            arrivePlace: null,
          },
        ],
        { at: "2026-04-29T19:00", tz: HI },
      ),
    ).toBeNull();
  });

  it("日時やタイムゾーンが分からなければ旅程の最初の場所", () => {
    expect(whereAt(legs, null)).toEqual(NRT);
    expect(whereAt(legs, { at: "2026-04-29T19:00", tz: null })).toEqual(NRT);
  });
});
