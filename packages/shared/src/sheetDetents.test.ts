import { describe, expect, it } from "vitest";

import { fitAndHalfDetents } from "./sheetDetents";

// 実機に近い値: iPhone 15/16 相当の画面高 852 − 上部インセット 59。
const MAX = 793;
// 場所一覧の「半分でもヘッダー＋1行が見える」下限（places.tsx と同じ考え方）。
const MIN_HALF = 94;

// RNS が要求する不変条件（これを破るとネイティブ側がエラーを吐くか、
// 意図しない detent が選ばれる）。
function expectValidDetents(detents: number[]) {
  expect(detents.length).toBeGreaterThan(0);
  for (const d of detents) {
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThanOrEqual(1);
  }
  for (let i = 1; i < detents.length; i++) {
    expect(detents[i]).toBeGreaterThan(detents[i - 1]);
  }
}

describe("fitAndHalfDetents", () => {
  it("既定の段は中身の高さそのもの（fitToContents と同じ）", () => {
    const { detents, initialIndex } = fitAndHalfDetents({
      contentHeight: 400,
      maxSheetHeight: MAX,
      minHalfHeight: MIN_HALF,
    });
    expectValidDetents(detents);
    // 開いた瞬間は必ず大きい方＝中身の高さ。
    expect(detents[initialIndex] * MAX).toBeCloseTo(400);
  });

  it("下の段はちょうど既定の半分", () => {
    const { detents, initialIndex } = fitAndHalfDetents({
      contentHeight: 400,
      maxSheetHeight: MAX,
      minHalfHeight: MIN_HALF,
    });
    expect(detents).toHaveLength(2);
    expect(initialIndex).toBe(1);
    expect(detents[0] * MAX).toBeCloseTo(200);
  });

  it("中身が画面より高いときは上限で頭打ち（一覧が長い旅行）", () => {
    const { detents, initialIndex } = fitAndHalfDetents({
      contentHeight: 5000,
      maxSheetHeight: MAX,
      minHalfHeight: MIN_HALF,
    });
    expectValidDetents(detents);
    expect(detents[initialIndex]).toBe(1);
    expect(detents[0]).toBeCloseTo(0.5);
  });

  it("半分が小さすぎる（場所が数件）ときは1段のまま", () => {
    // 中身 180 → 半分 90 は下限 94 未満。
    const { detents, initialIndex } = fitAndHalfDetents({
      contentHeight: 180,
      maxSheetHeight: MAX,
      minHalfHeight: MIN_HALF,
    });
    expectValidDetents(detents);
    expect(detents).toHaveLength(1);
    expect(initialIndex).toBe(0);
    expect(detents[0] * MAX).toBeCloseTo(180);
  });

  it("下限ちょうどでは2段になる", () => {
    const { detents } = fitAndHalfDetents({
      contentHeight: MIN_HALF * 2,
      maxSheetHeight: MAX,
      minHalfHeight: MIN_HALF,
    });
    expect(detents).toHaveLength(2);
    expectValidDetents(detents);
  });

  it("中身が空でも 0 の detent を作らない（初期フレームの保険）", () => {
    const { detents } = fitAndHalfDetents({
      contentHeight: 0,
      maxSheetHeight: MAX,
      minHalfHeight: MIN_HALF,
    });
    expectValidDetents(detents);
    expect(detents).toHaveLength(1);
  });

  it("画面高が未取得（0）でも壊れない", () => {
    const { detents, initialIndex } = fitAndHalfDetents({
      contentHeight: 400,
      maxSheetHeight: 0,
      minHalfHeight: MIN_HALF,
    });
    expectValidDetents(detents);
    expect(detents).toEqual([1]);
    expect(initialIndex).toBe(0);
  });

  it("どの中身の高さでも RNS の不変条件（昇順・(0,1]）を満たす", () => {
    for (let h = 1; h <= 2000; h += 7) {
      const { detents, initialIndex } = fitAndHalfDetents({
        contentHeight: h,
        maxSheetHeight: MAX,
        minHalfHeight: MIN_HALF,
      });
      expectValidDetents(detents);
      expect(initialIndex).toBe(detents.length - 1);
    }
  });
});
