import { describe, expect, it } from "vitest";

import { calculateExpenseSummary, type SummaryExpense } from "./expenseSummary";

const rates = { JPY: 1, USD: 150 };

describe("calculateExpenseSummary", () => {
  it("shared splittable：自分が splitMemberIds に含まれていれば按分額が加算", () => {
    const expenses: SummaryExpense[] = [
      {
        visibility: "shared",
        amount: 30000,
        currency: "JPY",
        payerMemberId: "alice",
        splittable: true,
        splitMemberIds: ["alice", "bob"],
        createdByMemberId: "alice",
      },
    ];
    expect(calculateExpenseSummary(expenses, "bob", rates)).toEqual({
      sharedSelfShare: 15000,
      privateTotal: 0,
      total: 15000,
    });
  });

  it("shared splittable：splitMemberIds に含まれていなければ 0", () => {
    const expenses: SummaryExpense[] = [
      {
        visibility: "shared",
        amount: 30000,
        currency: "JPY",
        payerMemberId: "alice",
        splittable: true,
        splitMemberIds: ["alice", "bob"],
        createdByMemberId: "alice",
      },
    ];
    expect(calculateExpenseSummary(expenses, "carol", rates)).toEqual({
      sharedSelfShare: 0,
      privateTotal: 0,
      total: 0,
    });
  });

  it("shared かつ splittable=false（おごり）：自分が支払者なら全額、それ以外は 0", () => {
    const expenses: SummaryExpense[] = [
      {
        visibility: "shared",
        amount: 5000,
        currency: "JPY",
        payerMemberId: "alice",
        splittable: false,
        splitMemberIds: [],
        createdByMemberId: "alice",
      },
    ];
    expect(calculateExpenseSummary(expenses, "alice", rates).total).toBe(5000);
    expect(calculateExpenseSummary(expenses, "bob", rates).total).toBe(0);
  });

  it("private：投稿者本人なら privateTotal に加算", () => {
    const expenses: SummaryExpense[] = [
      {
        visibility: "private",
        amount: 20,
        currency: "USD",
        payerMemberId: "bob",
        splittable: false,
        splitMemberIds: [],
        createdByMemberId: "bob",
      },
    ];
    expect(calculateExpenseSummary(expenses, "bob", rates)).toEqual({
      sharedSelfShare: 0,
      privateTotal: 3000,
      total: 3000,
    });
  });

  it("private：投稿者でないなら 0（防御的）", () => {
    const expenses: SummaryExpense[] = [
      {
        visibility: "private",
        amount: 20,
        currency: "USD",
        payerMemberId: "bob",
        splittable: false,
        splitMemberIds: [],
        createdByMemberId: "bob",
      },
    ];
    expect(calculateExpenseSummary(expenses, "alice", rates).total).toBe(0);
  });

  it("複合シナリオ：USD 200 のホテルを2人で割り勘 + USD 20 の private", () => {
    const expenses: SummaryExpense[] = [
      {
        visibility: "shared",
        amount: 200,
        currency: "USD",
        payerMemberId: "alice",
        splittable: true,
        splitMemberIds: ["alice", "bob"],
        createdByMemberId: "alice",
      },
      {
        visibility: "private",
        amount: 20,
        currency: "USD",
        payerMemberId: "bob",
        splittable: false,
        splitMemberIds: [],
        createdByMemberId: "bob",
      },
    ];
    // bob: 200 USD * 150 / 2 = 15000 + 20 USD * 150 = 3000 → total 18000
    expect(calculateExpenseSummary(expenses, "bob", rates)).toEqual({
      sharedSelfShare: 15000,
      privateTotal: 3000,
      total: 18000,
    });
  });
});
