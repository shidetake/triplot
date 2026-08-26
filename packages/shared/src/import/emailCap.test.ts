import { describe, expect, it } from "vitest";

import { effectiveEmailCap } from "./emailCap";

// docs/design/billing.md の「期待する挙動」の表（デフォルト30・優遇100・有料200）。
describe("effectiveEmailCap", () => {
  it("新規・無料は プランの上限そのまま", () => {
    expect(effectiveEmailCap(30, null)).toBe(30);
  });

  it("優遇・無料は 個別上書きが効く", () => {
    expect(effectiveEmailCap(30, 100)).toBe(100);
  });

  it("優遇・有料は プランの上限が勝つ（払ったのに枠が増えない、を防ぐ）", () => {
    expect(effectiveEmailCap(200, 100)).toBe(200);
  });

  it("優遇・退会後は 個別上書きに戻る", () => {
    expect(effectiveEmailCap(30, 100)).toBe(100);
  });

  it("新規・有料は プランの上限そのまま", () => {
    expect(effectiveEmailCap(200, null)).toBe(200);
  });

  it("個別上書き 0 は 上書き無しと同じ", () => {
    expect(effectiveEmailCap(30, 0)).toBe(30);
  });
});
