import { describe, expect, it } from "vitest";

import { planKmz } from "./placeKmz";
import type { KmlPlacemark } from "./placeKml";

const mark = (
  name: string,
  iconKey: string | null,
  colorHex: string | null,
): KmlPlacemark => ({
  name,
  lat: 35,
  lng: 139,
  description: null,
  colorHex,
  category: null,
  iconKey,
});

describe("planKmz", () => {
  it("同じ (アイコン × 色) は1スタイルに畳む", () => {
    const plan = planKmz([
      mark("A", "food", "#10b981"),
      mark("B", "food", "#10b981"),
      mark("C", "food", "#f59e0b"),
    ]);
    expect(plan.styles).toHaveLength(2);
    expect(plan.marks[0].styleId).toBe(plan.marks[1].styleId);
    expect(plan.marks[2].styleId).not.toBe(plan.marks[0].styleId);
  });

  it("汎用ピンは画像を作らず既定マーカーに色だけ載せる", () => {
    const plan = planKmz([mark("A", "pin", "#10b981")]);
    expect(plan.needs).toHaveLength(0);
    expect(plan.styles[0].iconHref).toBeUndefined();
  });

  it("アイコン付きは zip 内のパスを参照する", () => {
    const plan = planKmz([mark("A", "cafe", "#10b981")]);
    expect(plan.needs).toEqual([
      {
        styleId: "s0",
        iconKey: "cafe",
        colorHex: "#10b981",
        needsImage: true,
        href: "files/s0.png",
      },
    ]);
    expect(plan.styles[0].iconHref).toBe("files/s0.png");
  });

  it("iconKey 未指定は汎用ピン扱い", () => {
    const plan = planKmz([mark("A", null, null)]);
    expect(plan.needs).toHaveLength(0);
  });
});
