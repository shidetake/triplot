import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { DRAIN_BUDGET_MS, FUNCTION_MAX_SECONDS } from "./process";

// 関数の寿命は2箇所にある。cron のルートの `export const maxDuration`（Next が
// 静的に読むのでリテラルでないといけない）と、予算の計算に使う
// FUNCTION_MAX_SECONDS。**片方だけ動かすと壊れる**:
//   - ルートだけ伸ばす → 予算が短いまま＝伸ばした意味が無い
//   - 定数だけ伸ばす  → 予算が寿命を超え、抽出の途中で関数が殺される
// 二重に持つのは Next の制約なので、ズレないことをここで縛る。
describe("関数の寿命", () => {
  const route = readFileSync(
    new URL("../../app/api/cron/retry-extract/route.ts", import.meta.url),
    "utf8",
  );

  it("cron のルートの maxDuration と定数が一致する", () => {
    const m = route.match(/^export const maxDuration = (\d+);$/m);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(FUNCTION_MAX_SECONDS);
  });

  it("予算は寿命より内側（走り出した1件ぶんの余裕がある）", () => {
    expect(DRAIN_BUDGET_MS).toBeLessThan(FUNCTION_MAX_SECONDS * 1000);
    // 1件の最悪（60秒）を足しても寿命を超えない。
    expect(DRAIN_BUDGET_MS + 60_000).toBeLessThanOrEqual(
      FUNCTION_MAX_SECONDS * 1000,
    );
  });
});
