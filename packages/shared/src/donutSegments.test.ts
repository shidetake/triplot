import { describe, expect, it } from "vitest";

import { donutSegments } from "./donutSegments";

const C = 100; // 扱いやすい円周

describe("donutSegments", () => {
  it("合計が 0 なら何も描かない", () => {
    expect(
      donutSegments([{ key: "a", value: 0 }], { circumference: C, gapPx: 2 }),
    ).toEqual([]);
    expect(donutSegments([], { circumference: C, gapPx: 2 })).toEqual([]);
  });

  it("1切れだけなら切れ目を作らず円周いっぱい", () => {
    expect(
      donutSegments([{ key: "a", value: 5 }], { circumference: C, gapPx: 2 }),
    ).toEqual([{ key: "a", dash: 100, offset: -0 }]);
  });

  it("割合どおりに分け、切れ目のぶんだけ弧を短くする", () => {
    const segs = donutSegments(
      [
        { key: "a", value: 3 },
        { key: "b", value: 1 },
      ],
      { circumference: C, gapPx: 2 },
    );
    expect(segs).toEqual([
      { key: "a", dash: 73, offset: -0 }, // 75 - 2
      { key: "b", dash: 23, offset: -75 }, // 25 - 2
    ]);
  });

  it("値が 0 のカテゴリは描かない（並びの詰めも起きる）", () => {
    const segs = donutSegments(
      [
        { key: "a", value: 1 },
        { key: "zero", value: 0 },
        { key: "b", value: 1 },
      ],
      { circumference: C, gapPx: 2 },
    );
    expect(segs.map((s) => s.key)).toEqual(["a", "b"]);
    expect(segs[1].offset).toBe(-50);
  });

  it("切れ目より細い切れも消さない", () => {
    const segs = donutSegments(
      [
        { key: "big", value: 999 },
        { key: "tiny", value: 1 },
      ],
      { circumference: C, gapPx: 2 },
    );
    const tiny = segs.find((s) => s.key === "tiny")!;
    expect(tiny.dash).toBeGreaterThan(0);
  });
});
