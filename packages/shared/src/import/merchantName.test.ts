import { describe, expect, it } from "vitest";

import { normalizeMerchant, stripPaymentPrefix } from "./merchantName";

describe("stripPaymentPrefix", () => {
  it("決済代行の接頭辞を落とす", () => {
    expect(stripPaymentPrefix("SQ *HOWZIT BREWING")).toBe("HOWZIT BREWING");
    expect(stripPaymentPrefix("TST* HANA KOA BREWING")).toBe(
      "HANA KOA BREWING",
    );
    expect(stripPaymentPrefix("FH* DIVE OAHU HANAUMA")).toBe(
      "DIVE OAHU HANAUMA",
    );
  });

  it("付いていなければそのまま", () => {
    expect(stripPaymentPrefix("Howzit Brewing")).toBe("Howzit Brewing");
    // ハイフン区切りは決済代行の接頭辞ではない（施設名の一部）。
    expect(stripPaymentPrefix("SSA - HANAUMA BAY")).toBe("SSA - HANAUMA BAY");
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
