import { describe, expect, it } from "vitest";

import { mergedTotal } from "./receiptTotal";

// 印（totalIsDelta）が付いている＝主の経路。
const marked = (total: number, totalIsDelta = false, currency = "USD") => ({
  total,
  currency,
  totalIsDelta,
});

// 印が付かなかった発行元＝下の網の経路。決済通知どうしで、片方が確定・更新。
const notice = (total: number, isUpdate: boolean) => ({
  total,
  currency: "USD",
  totalIsDelta: false,
  dateIsSettlement: true,
  isUpdate,
});

describe("mergedTotal — 印がある時（主）", () => {
  // 実データ: ソニー銀行の〔利用 50 ＋ 確定 5〕。5/50 = 10%。
  it("片方が差額なら足す", () => {
    expect(mergedTotal(marked(50), marked(5, true), 50)).toEqual({
      total: 55,
      summed: true,
    });
  });

  it("差額が先に届いていても足す", () => {
    expect(mergedTotal(marked(5, true), marked(50), 50).total).toBe(55);
  });

  it("両方が総額なら足さない（重複・更新）", () => {
    expect(mergedTotal(marked(66.56), marked(66.56), 66.56)).toEqual({
      total: 66.56,
      summed: false,
    });
  });

  it("両方が差額なら足さない（同じ確定通知が2回）", () => {
    expect(mergedTotal(marked(11.09, true), marked(11.09, true), 11.09).total).toBe(
      11.09,
    );
  });

  it("通貨が違えば足さない", () => {
    expect(mergedTotal(marked(50), marked(5, true, "JPY"), 50).total).toBe(50);
  });
});

describe("mergedTotal — 印が無い時の網（チップの割合）", () => {
  it("決済通知どうしで確定の額がチップの割合なら足す", () => {
    // 55.47 の会計に 11.09（20%）。
    expect(mergedTotal(notice(55.47, false), notice(11.09, true), 11.09)).toEqual({
      total: 66.56,
      summed: true,
    });
  });

  it("少額の会計の定額チップも拾う（9.42 に 1.00 ＝ 10.6%）", () => {
    expect(mergedTotal(notice(9.42, false), notice(1, true), 9.42).total).toBe(
      10.42,
    );
  });

  it("一部確定・一部返金の割合では足さない（$100 承認 → $40 確定）", () => {
    expect(mergedTotal(notice(100, false), notice(40, true), 40)).toEqual({
      total: 100,
      summed: false,
    });
  });

  it("店のレシートが相手なら足さない（レシートにチップは含まれている）", () => {
    const receipt = { total: 66.56, currency: "USD", dateIsSettlement: false };
    expect(mergedTotal(receipt, notice(11.09, true), 66.56).total).toBe(66.56);
  });

  it("どちらも確定でなければ足さない（同じ通知が2回）", () => {
    expect(mergedTotal(notice(55.47, false), notice(11.09, false), 11.09).total).toBe(
      55.47,
    );
  });

  it("印が付いていればそちらが勝つ（割合の外でも足す）", () => {
    // 40% でも、メールが差額だと言っているなら足す。
    expect(mergedTotal(marked(100), marked(40, true), 100).total).toBe(140);
  });
});

describe("mergedTotal — 足さない時の歯止め", () => {
  it("合体後は元のどれよりも小さくならない", () => {
    // 実データ: 55.47 の会計に 11.09 の調整が来て、合体結果が 11.09 になった。
    expect(mergedTotal(marked(55.47), marked(11.09), 11.09).total).toBe(55.47);
  });

  it("LLM が元より大きい額を出したらそちらを使う", () => {
    expect(mergedTotal(marked(55.47), marked(11.09), 66.56).total).toBe(66.56);
  });
});
