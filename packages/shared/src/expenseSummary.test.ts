import { describe, expect, it } from "vitest";

import { calculateExpenseSummary, type SummaryExpense } from "./expenseSummary";

describe("calculateExpenseSummary", () => {
  it("shared splittable：自分が splitMemberIds に含まれていれば按分額が個人合計に入る", () => {
    const expenses: SummaryExpense[] = [
      {
        visibility: "shared",
        amountInDefault: 30000,
        payerMemberId: "alice",
        splittable: true,
        splitMemberIds: ["alice", "bob"],
        createdByMemberId: "alice",
      },
    ];
    expect(calculateExpenseSummary(expenses, "bob")).toEqual({
      personalTotal: 15000,
      tripTotal: 30000,
    });
  });

  it("shared splittable：splitMemberIds に含まれていなければ個人合計は 0（旅行合計には入る）", () => {
    const expenses: SummaryExpense[] = [
      {
        visibility: "shared",
        amountInDefault: 30000,
        payerMemberId: "alice",
        splittable: true,
        splitMemberIds: ["alice", "bob"],
        createdByMemberId: "alice",
      },
    ];
    expect(calculateExpenseSummary(expenses, "carol")).toEqual({
      personalTotal: 0,
      tripTotal: 30000,
    });
  });

  it("shared かつ splittable=false（おごり）：個人合計は支払者だけ全額、旅行合計は誰から見ても全額", () => {
    const expenses: SummaryExpense[] = [
      {
        visibility: "shared",
        amountInDefault: 5000,
        payerMemberId: "alice",
        splittable: false,
        splitMemberIds: [],
        createdByMemberId: "alice",
      },
    ];
    expect(calculateExpenseSummary(expenses, "alice")).toEqual({
      personalTotal: 5000,
      tripTotal: 5000,
    });
    expect(calculateExpenseSummary(expenses, "bob")).toEqual({
      personalTotal: 0,
      tripTotal: 5000,
    });
  });

  it("private：投稿者本人の個人合計にだけ入り、旅行合計には入らない", () => {
    const expenses: SummaryExpense[] = [
      {
        visibility: "private",
        amountInDefault: 3000,
        payerMemberId: "bob",
        splittable: false,
        splitMemberIds: [],
        createdByMemberId: "bob",
      },
    ];
    expect(calculateExpenseSummary(expenses, "bob")).toEqual({
      personalTotal: 3000,
      tripTotal: 0,
    });
  });

  it("private：投稿者でないなら個人合計にも入らない（防御的）", () => {
    const expenses: SummaryExpense[] = [
      {
        visibility: "private",
        amountInDefault: 3000,
        payerMemberId: "bob",
        splittable: false,
        splitMemberIds: [],
        createdByMemberId: "bob",
      },
    ];
    expect(calculateExpenseSummary(expenses, "alice")).toEqual({
      personalTotal: 0,
      tripTotal: 0,
    });
  });

  it("旅行合計は誰が見ても同じ額になる（自分のプライベートも含めない）", () => {
    const expenses: SummaryExpense[] = [
      {
        visibility: "shared",
        amountInDefault: 30000,
        payerMemberId: "alice",
        splittable: true,
        splitMemberIds: ["alice", "bob"],
        createdByMemberId: "alice",
      },
      {
        visibility: "private",
        amountInDefault: 3000,
        payerMemberId: "alice",
        splittable: false,
        splitMemberIds: [],
        createdByMemberId: "alice",
      },
      {
        visibility: "private",
        amountInDefault: 7000,
        payerMemberId: "bob",
        splittable: false,
        splitMemberIds: [],
        createdByMemberId: "bob",
      },
    ];
    // 自分のプライベートは見えている（RLS 上そうなる）が、旅行合計には入れない。
    expect(calculateExpenseSummary(expenses, "alice").tripTotal).toBe(30000);
    expect(calculateExpenseSummary(expenses, "bob").tripTotal).toBe(30000);
    expect(calculateExpenseSummary(expenses, "carol").tripTotal).toBe(30000);
  });

  it("複合シナリオ：30000 ホテル割り勘 + 3000 private", () => {
    const expenses: SummaryExpense[] = [
      {
        visibility: "shared",
        amountInDefault: 30000,
        payerMemberId: "alice",
        splittable: true,
        splitMemberIds: ["alice", "bob"],
        createdByMemberId: "alice",
      },
      {
        visibility: "private",
        amountInDefault: 3000,
        payerMemberId: "bob",
        splittable: false,
        splitMemberIds: [],
        createdByMemberId: "bob",
      },
    ];
    // bob の個人合計: 30000/2 = 15000 + 3000 = 18000。旅行合計は共有の 30000 だけ。
    expect(calculateExpenseSummary(expenses, "bob")).toEqual({
      personalTotal: 18000,
      tripTotal: 30000,
    });
  });
});
