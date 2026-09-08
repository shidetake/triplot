import { describe, expect, it } from "vitest";

import { initialRate } from "./draftRate";

const fx = { base: "USD", date: "2026-04-30", rates: { JPY: 156.56 } };

describe("initialRate", () => {
  it("精算通貨と同じなら 1", () => {
    expect(
      initialRate({ currency: "JPY", defaultCurrency: "JPY", averageRates: {} }),
    ).toEqual({ rate: 1, source: "same" });
  });

  it("実績があればその平均（市場レートより優先）", () => {
    expect(
      initialRate({
        currency: "USD",
        defaultCurrency: "JPY",
        averageRates: { USD: 160 },
        draft: { initialCurrency: "USD", fxRates: fx },
      }),
    ).toEqual({ rate: 160, source: "average" });
  });

  // 実データ: 取り込んだ下書きから開いたフォームで、その通貨の1件目だと
  // レート欄が空欄のままだった。
  it("実績が無ければ取り込み時の市場レート", () => {
    expect(
      initialRate({
        currency: "USD",
        defaultCurrency: "JPY",
        averageRates: {},
        draft: { initialCurrency: "USD", fxRates: fx },
      }),
    ).toEqual({ rate: 156.56, source: "market" });
  });

  it("下書きの通貨から変えたら市場レートは使わない", () => {
    expect(
      initialRate({
        currency: "EUR",
        defaultCurrency: "JPY",
        averageRates: {},
        draft: { initialCurrency: "USD", fxRates: fx },
      }),
    ).toBeNull();
  });

  it("手入力（下書き無し）で実績も無ければ空", () => {
    expect(
      initialRate({ currency: "USD", defaultCurrency: "JPY", averageRates: {} }),
    ).toBeNull();
  });

  it("取り込みでもレート表が無ければ空", () => {
    expect(
      initialRate({
        currency: "USD",
        defaultCurrency: "JPY",
        averageRates: {},
        draft: { initialCurrency: "USD", fxRates: null },
      }),
    ).toBeNull();
  });
});
