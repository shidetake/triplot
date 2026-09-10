import { describe, expect, it } from "vitest";

import { formatRate, formatStoredRate } from "./formatRate";

describe("formatRate", () => {
  it("rounds long decimals to ~5 significant figures (JPY pair → 2 decimals)", () => {
    expect(formatRate(148.33333333333334)).toBe("148.33");
  });

  it("keeps ~4 decimals for ~1.x rates (major pair convention)", () => {
    expect(formatRate(1.0825397)).toBe("1.0825");
  });

  it("adds decimals for small rates to preserve precision", () => {
    expect(formatRate(0.00673401)).toBe("0.006734");
  });

  it("drops trailing zeros", () => {
    expect(formatRate(150)).toBe("150");
    expect(formatRate(9.5)).toBe("9.5");
  });

  it("returns empty string for non-finite", () => {
    expect(formatRate(NaN)).toBe("");
    expect(formatRate(Infinity)).toBe("");
  });

  it("respects custom sig figs", () => {
    expect(formatRate(148.33333, 2)).toBe("150");
    expect(formatRate(148.33333, 4)).toBe("148.3");
  });
});

// 保存済みの値は実データなので丸めない。落とすのは二進小数の誤差だけ。
describe("formatStoredRate", () => {
  it("平均から出た誤差を落とす", () => {
    expect(formatStoredRate(157.11999999999998)).toBe("157.12");
  });

  it("実データの精度は削らない（formatRate との違い）", () => {
    expect(formatStoredRate(157.115)).toBe("157.115");
    expect(formatRate(157.115)).toBe("157.12");
  });

  it("小さい値もそのまま残す", () => {
    expect(formatStoredRate(0.006734)).toBe("0.006734");
  });
});
