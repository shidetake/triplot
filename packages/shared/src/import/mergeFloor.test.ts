import { describe, expect, it } from "vitest";

// 合体後の total は元のどれよりも小さくならない、という不変条件。
// 実装は apps/web の findMerge が持つ（LLM 呼び出しを含むのでここでは規則だけ
// 固定する）。実測: 55.47 の飲食に 11.09（ちょうど 20%＝チップ）の調整が来た時、
// 合体結果が 11.09 になった＝調整額が元を丸ごと置き換えていた。
function clampToParts(merged: number, parts: number[]): number {
  const floor = Math.max(0, ...parts);
  return merged < floor ? floor : merged;
}

describe("合体後の金額は元より小さくならない", () => {
  it("調整額が元を置き換えたら、元に戻す", () => {
    expect(clampToParts(11.09, [55.47, 11.09])).toBe(55.47);
  });

  it("正しく足されていればそのまま", () => {
    expect(clampToParts(66.56, [55.47, 11.09])).toBe(66.56);
  });

  it("重複で大きい方が残るのもそのまま", () => {
    expect(clampToParts(29.05, [29.05, 29.05])).toBe(29.05);
  });
});
