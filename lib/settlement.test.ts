import { describe, expect, it } from "vitest";

import {
  calculateSettlements,
  type SettlementExpense,
  type SettlementMember,
} from "./settlement";

const members: SettlementMember[] = [
  { id: "alice" },
  { id: "bob" },
  { id: "carol" },
];

describe("calculateSettlements", () => {
  it("費用がない場合は空配列", () => {
    expect(calculateSettlements([], members)).toEqual([]);
  });

  it("2人で割り勘：alice が 1000 払い、bob と alice で割り勘 → bob が alice に 500", () => {
    const expenses: SettlementExpense[] = [
      {
        id: "e1",
        amount: 1000,
        payerMemberId: "alice",
        splitMemberIds: ["alice", "bob"],
      },
    ];
    const result = calculateSettlements(expenses, members);
    expect(result).toEqual([
      { fromMemberId: "bob", toMemberId: "alice", amount: 500 },
    ]);
  });

  it("3人で alice が 3000 払い全員で割り勘 → bob と carol が 1000 ずつ alice に", () => {
    const expenses: SettlementExpense[] = [
      {
        id: "e1",
        amount: 3000,
        payerMemberId: "alice",
        splitMemberIds: ["alice", "bob", "carol"],
      },
    ];
    const result = calculateSettlements(expenses, members);
    // どちらの順序でもよいので、2件あって合計 2000 が alice に向かうことを確認
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.toMemberId === "alice")).toBe(true);
    expect(result.reduce((s, t) => s + t.amount, 0)).toBe(2000);
  });

  it("複数費用がある場合に最小トランザクションでまとめる", () => {
    // alice が 6000 払い、bob が 3000 払い、それぞれ全員で割り勘
    // 1人あたり 3000 ずつ負担。alice は +3000、bob は 0、carol は -3000
    // → carol が alice に 3000 払う（1トランザクション）
    const expenses: SettlementExpense[] = [
      {
        id: "e1",
        amount: 6000,
        payerMemberId: "alice",
        splitMemberIds: ["alice", "bob", "carol"],
      },
      {
        id: "e2",
        amount: 3000,
        payerMemberId: "bob",
        splitMemberIds: ["alice", "bob", "carol"],
      },
    ];
    const result = calculateSettlements(expenses, members);
    expect(result).toEqual([
      { fromMemberId: "carol", toMemberId: "alice", amount: 3000 },
    ]);
  });

  it("既にバランスが取れているときは空配列", () => {
    // alice と bob がそれぞれ 1000 払い、alice と bob で割り勘
    const expenses: SettlementExpense[] = [
      {
        id: "e1",
        amount: 1000,
        payerMemberId: "alice",
        splitMemberIds: ["alice", "bob"],
      },
      {
        id: "e2",
        amount: 1000,
        payerMemberId: "bob",
        splitMemberIds: ["alice", "bob"],
      },
    ];
    const result = calculateSettlements(expenses, members);
    expect(result).toEqual([]);
  });

  it("splitMemberIds が空の expense は無視される", () => {
    const expenses: SettlementExpense[] = [
      {
        id: "e1",
        amount: 5000,
        payerMemberId: "alice",
        splitMemberIds: [],
      },
    ];
    expect(calculateSettlements(expenses, members)).toEqual([]);
  });
});
