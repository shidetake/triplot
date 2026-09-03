import { describe, expect, it } from "vitest";

import type { Receipt } from "@triplot/shared/import/schema";

import { normalizeReceipt, toHalfWidth, truncateToWidth } from "./normalize";

describe("toHalfWidth", () => {
  it("全角英字・記号・スペースを半角にして連続スペースを詰める", () => {
    expect(toHalfWidth("ＵＢＥＲ　　　＊ＴＲＩＰ")).toBe("UBER *TRIP");
  });
  it("全角数字を半角に", () => {
    expect(toHalfWidth("８９９４０２")).toBe("899402");
  });
  it("日本語はそのまま", () => {
    expect(toHalfWidth("飲食")).toBe("飲食");
  });
  it("カタカナは半角にしない", () => {
    expect(toHalfWidth("ソニー銀行")).toBe("ソニー銀行");
  });
  it("混在もOK", () => {
    expect(toHalfWidth("ＫＡＩ ＣＯＦＦＥＥ 浅草")).toBe("KAI COFFEE 浅草");
  });
});

describe("truncateToWidth", () => {
  it("収まるならそのまま", () => {
    expect(truncateToWidth("アイスカフェラテ", 28)).toBe("アイスカフェラテ");
  });

  it("超えていたら安全な区切りで切って … を付ける", () => {
    const long =
      "Kona Gold Cliff IPA, Filet Mignon, Caesar, Mushroom Fries, Michelob Ultra";
    const out = truncateToWidth(long, 28);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThan(long.length);
    // 単語の途中で切れていない（カンマ・スペース区切りの直後で止まる）。
    expect(out).toBe("Kona Gold Cliff IPA, Filet Mignon, Caesar, Mushroom…");
  });

  it("区切りが遠すぎる時は素直に切る（戻りすぎて短くなりすぎない）", () => {
    const out = truncateToWidth("ratherlongsinglewordwithnobreak", 10);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(21);
  });
});

describe("normalizeReceipt の items 切り詰め", () => {
  const base: Receipt = {
    merchant: "Hula Grill Waikiki",
    total: 100,
    currency: "USD",
    date: "2026-05-01",
    serviceDate: null,
    time: null,
    category: "飲食",
    location: null,
    address: null,
    referenceId: null,
    isUpdate: false,
    dateIsSettlement: false,
    items: null,
  };

  it("LLM の要約が上限を超えていたら安全な位置で切る", () => {
    const r = normalizeReceipt({
      ...base,
      items:
        "Kona Gold Cliff IPA, Filet Mignon, Caesar, Mushroom Fries, Michelob Ultra",
    });
    expect(r.items).toBe(
      "Kona Gold Cliff IPA, Filet Mignon, Caesar, Mushroom…",
    );
  });

  it("収まっているものは変えない（LLM の要約結果をそのまま尊重）", () => {
    const r = normalizeReceipt({ ...base, items: "ビール" });
    expect(r.items).toBe("ビール");
  });

  it("items が無ければ null のまま", () => {
    const r = normalizeReceipt({ ...base, items: null });
    expect(r.items).toBeNull();
  });
});
