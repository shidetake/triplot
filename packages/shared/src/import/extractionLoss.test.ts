import { describe, expect, it } from "vitest";

import { extractionLostDetail, type Extraction } from "./schema";

const receipt = { merchant: "The Royal Hawaiian", total: 100 } as unknown;
const ev = { title: "宿泊" } as unknown;

const of = (r: unknown, n: number): Extraction =>
  ({ receipt: r, events: Array.from({ length: n }, () => ev) }) as Extraction;

describe("extractionLostDetail", () => {
  it("費用が消えたら失っている", () => {
    expect(extractionLostDetail(of(receipt, 0), of(null, 0))).toBe(true);
  });

  it("予定が減ったら失っている", () => {
    expect(extractionLostDetail(of(null, 2), of(null, 1))).toBe(true);
  });

  // 実際に起きた形: 第1パスは宿泊の予定を見つけたのに、第2パスが空を返した。
  // ここで採用してしまうと恒久エラー（no_content）になり、二度と取り込めない。
  it("第1パスが見つけたのに第2パスが空なら失っている", () => {
    expect(extractionLostDetail(of(null, 1), of(null, 0))).toBe(true);
  });

  it("同じ・増えた・値が変わっただけなら失っていない", () => {
    expect(extractionLostDetail(of(receipt, 1), of(receipt, 1))).toBe(false);
    expect(extractionLostDetail(of(null, 0), of(receipt, 2))).toBe(false);
    expect(
      extractionLostDetail(of(receipt, 1), of({ ...(receipt as object), total: 120 }, 1)),
    ).toBe(false);
  });
});
