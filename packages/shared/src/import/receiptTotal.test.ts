import { describe, expect, it } from "vitest";

import { mergedTotal } from "./receiptTotal";

const r = (total: number, totalIsDelta = false, currency = "USD") => ({
  total,
  currency,
  totalIsDelta,
});

describe("mergedTotal", () => {
  // 実データ: ソニー銀行の〔利用 50 ＋ 確定 5〕。5/50 = 10% で、割合では
  // チップに見えないので LLM は足さなかった。
  it("片方が差額なら足す（割合に依らない）", () => {
    expect(mergedTotal(r(50), r(5, true), 50)).toBe(55);
  });

  it("差額が先に届いていても足す", () => {
    expect(mergedTotal(r(5, true), r(50), 50)).toBe(55);
  });

  it("両方が総額なら足さない（重複・更新）", () => {
    expect(mergedTotal(r(66.56), r(66.56), 66.56)).toBe(66.56);
  });

  it("両方が差額なら足さない（同じ確定通知が2回）", () => {
    expect(mergedTotal(r(11.09, true), r(11.09, true), 11.09)).toBe(11.09);
  });

  it("通貨が違えば足さない", () => {
    expect(mergedTotal(r(50), r(5, true, "JPY"), 50)).toBe(50);
  });

  it("古い下書き（差額の印を持たない）は総額として扱う", () => {
    expect(mergedTotal({ total: 50, currency: "USD" }, r(5, true), 50)).toBe(55);
  });

  it("足さない時、合体後は元のどれよりも小さくならない", () => {
    // 実データ: 55.47 の会計に 11.09 の調整が来て、合体結果が 11.09 になった。
    expect(mergedTotal(r(55.47), r(11.09), 11.09)).toBe(55.47);
  });

  it("足さない時、LLM が元より大きい額を出したらそちらを使う", () => {
    expect(mergedTotal(r(55.47), r(11.09), 66.56)).toBe(66.56);
  });
});
