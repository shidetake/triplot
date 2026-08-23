import { describe, expect, it } from "vitest";

import { pickTzByLongitude, type TzCandidate } from "./schedule";

// 移動日の TZ 候補（同じ暦日に2つの TZ が並ぶ状態）。
const cand = (tz: string, side: "depart" | "arrive"): TzCandidate => ({
  tz,
  transitId: "t1",
  side,
});

const TOKYO_HNL = [
  cand("Asia/Tokyo", "depart"),
  cand("Pacific/Honolulu", "arrive"),
];

describe("pickTzByLongitude", () => {
  it("ホノルルの店なら到着側（Pacific/Honolulu）を選ぶ", () => {
    // Hana Koa Brewing Co. 相当の経度。
    expect(pickTzByLongitude(TOKYO_HNL, -157.86, "2026-04-28")?.tz).toBe(
      "Pacific/Honolulu",
    );
  });

  it("東京の店なら出発側（Asia/Tokyo）を選ぶ", () => {
    expect(pickTzByLongitude(TOKYO_HNL, 139.69, "2026-04-28")?.tz).toBe(
      "Asia/Tokyo",
    );
  });

  it("帰りの便（候補の順序が逆）でも場所で決まる", () => {
    const hnlToTokyo = [
      cand("Pacific/Honolulu", "depart"),
      cand("Asia/Tokyo", "arrive"),
    ];
    expect(pickTzByLongitude(hnlToTokyo, 139.69, "2026-05-05")?.tz).toBe(
      "Asia/Tokyo",
    );
    expect(pickTzByLongitude(hnlToTokyo, -157.86, "2026-05-05")?.tz).toBe(
      "Pacific/Honolulu",
    );
  });

  it("日付変更線を跨ぐ組み合わせでも近い方を選ぶ", () => {
    // オークランド(+12/+13) と ホノルル(-10) は UTC オフセットで 22〜23 時間
    // 離れているが、円環で見れば隣接している。素直に引き算すると誤る。
    const nzToHnl = [
      cand("Pacific/Auckland", "depart"),
      cand("Pacific/Honolulu", "arrive"),
    ];
    expect(pickTzByLongitude(nzToHnl, 174.76, "2026-04-28")?.tz).toBe(
      "Pacific/Auckland",
    );
    expect(pickTzByLongitude(nzToHnl, -157.86, "2026-04-28")?.tz).toBe(
      "Pacific/Honolulu",
    );
  });

  it("夏時間のある TZ でも、その日の実効オフセットで判定する", () => {
    const tokyoLA = [
      cand("Asia/Tokyo", "depart"),
      cand("America/Los_Angeles", "arrive"),
    ];
    // 7月は PDT(-7)。冬は PST(-8) だがどちらでも西海岸側に寄る。
    expect(pickTzByLongitude(tokyoLA, -118.24, "2026-07-15")?.tz).toBe(
      "America/Los_Angeles",
    );
    expect(pickTzByLongitude(tokyoLA, -118.24, "2026-01-15")?.tz).toBe(
      "America/Los_Angeles",
    );
  });

  it("経度が無ければ判定しない（呼び出し側が先頭候補に落ちる）", () => {
    expect(pickTzByLongitude(TOKYO_HNL, null, "2026-04-28")).toBeNull();
    expect(pickTzByLongitude(TOKYO_HNL, undefined, "2026-04-28")).toBeNull();
    expect(pickTzByLongitude(TOKYO_HNL, Number.NaN, "2026-04-28")).toBeNull();
  });

  it("候補が空なら null", () => {
    expect(pickTzByLongitude([], 139.69, "2026-04-28")).toBeNull();
  });
});
