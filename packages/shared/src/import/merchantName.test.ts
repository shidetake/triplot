import { describe, expect, it } from "vitest";

import { normalizeMerchant, stripPaymentPrefix } from "./merchantName";

describe("stripPaymentPrefix", () => {
  it("アスタリスクの形で落とす（提供元を数え上げない）", () => {
    expect(stripPaymentPrefix("SQ *HOWZIT BREWING")).toBe("HOWZIT BREWING");
    expect(stripPaymentPrefix("TST* HANA KOA BREWING")).toBe(
      "HANA KOA BREWING",
    );
    expect(stripPaymentPrefix("FH* DIVE OAHU HANAUMA")).toBe(
      "DIVE OAHU HANAUMA",
    );
    expect(stripPaymentPrefix("UBER *TRIP")).toBe("TRIP");
    expect(stripPaymentPrefix("*TUTU’S TREATS")).toBe("TUTU’S TREATS");
  });

  it("アスタリスクが無ければ落とさない（実在の店名を削らない）", () => {
    expect(stripPaymentPrefix("Howzit Brewing")).toBe("Howzit Brewing");
    // 削ると施設ではなく地形のハナウマ湾が返る（実測）。
    expect(stripPaymentPrefix("SSA - HANAUMA BAY")).toBe("SSA - HANAUMA BAY");
    expect(stripPaymentPrefix("SP Kai Coffee")).toBe("SP Kai Coffee");
  });
});

describe("normalizeMerchant", () => {
  it("接頭辞と大小・記号の違いを吸収する", () => {
    expect(normalizeMerchant("SQ *HOWZIT BREWING")).toBe(
      normalizeMerchant("Howzit Brewing"),
    );
  });

  it("別の店舗は別のまま（完全一致でしか使わない）", () => {
    expect(normalizeMerchant("ABC #78 HAWAII")).not.toBe(
      normalizeMerchant("ABC #31 HAWAII"),
    );
  });

  it("途中で切れた表記は一致しない（取りこぼす方に倒す）", () => {
    expect(normalizeMerchant("NALU HEALTH BAR AT WAI")).not.toBe(
      normalizeMerchant("NALU HEALTH BAR AT WAIKIKI"),
    );
  });
});
