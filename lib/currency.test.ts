import { describe, expect, it } from "vitest";

import { convertToDefault } from "./currency";

describe("convertToDefault", () => {
  it("default_currency と同じ通貨ならレート関係なく等倍", () => {
    expect(convertToDefault(1000, "JPY", { JPY: 1, USD: 150 })).toBe(1000);
  });

  it("USD を JPY に換算する（1 USD = 150 JPY）", () => {
    expect(convertToDefault(20, "USD", { JPY: 1, USD: 150 })).toBe(3000);
  });

  it("レート未設定の通貨は等倍として扱う（fallback）", () => {
    expect(convertToDefault(100, "USD", { JPY: 1 })).toBe(100);
  });
});
