import { describe, expect, it } from "vitest";

import { rateTo, type FxRates } from "./fxRates";

const fx: FxRates = {
  date: "2026-04-30",
  base: "USD",
  rates: { JPY: 156.56, EUR: 0.85455 },
};

describe("rateTo", () => {
  it("目的の通貨のレートを返す", () => {
    expect(rateTo(fx, "JPY")).toBe(156.56);
  });

  it("基準と同じ通貨なら 1", () => {
    expect(rateTo(fx, "USD")).toBe(1);
  });

  it("表に無い通貨は null（呼び出し側が「決められない」に倒す）", () => {
    expect(rateTo(fx, "XYZ")).toBeNull();
  });

  it("表そのものが無ければ null", () => {
    expect(rateTo(null, "JPY")).toBeNull();
  });
});
