import { describe, expect, it } from "vitest";

import { formatAmount } from "./formatAmount";

describe("formatAmount", () => {
  it("JPY は小数なし", () => {
    expect(formatAmount(1234, "JPY")).toBe("￥1,234");
    expect(formatAmount(1234.5, "JPY")).toBe("￥1,235"); // 四捨五入
  });

  it("USD は2桁", () => {
    expect(formatAmount(12.3, "USD")).toBe("$12.30");
    expect(formatAmount(1000, "USD")).toBe("$1,000.00");
  });
});
