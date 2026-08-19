import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  hueOfHex,
  NEUTRAL,
  PAGE_BG,
  roleColor,
  type ColorRole,
} from "./colorRoles";

const HUES = Array.from({ length: 360 }, (_, i) => i);

function pair(hue: number, role: ColorRole) {
  const p = roleColor(hue, role);
  if (!p) throw new Error(`no color for hue ${hue}`);
  return p;
}

// テストは「ラダーの数値がこうなっている」ではなく「どの色相でも規格を
// 満たす」を検証する。表を触ったら数値ではなくここが落ちて気付ける。
describe("色の役割ラダー", () => {
  describe("WCAG 2.2 の下限（全 360 色相）", () => {
    it("面の上の文字は 4.5:1 以上（SC 1.4.3 本文）", () => {
      for (const h of HUES) {
        for (const mode of ["light", "dark"] as const) {
          const r = contrastRatio(
            pair(h, "onSurface")[mode],
            pair(h, "surface")[mode],
          );
          expect(r, `hue ${h} / ${mode}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it("hover した面の上でも文字は 4.5:1 以上", () => {
      for (const h of HUES) {
        for (const mode of ["light", "dark"] as const) {
          const r = contrastRatio(
            pair(h, "onSurface")[mode],
            pair(h, "surfaceHover")[mode],
          );
          expect(r, `hue ${h} / ${mode}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it("単色の図形はページ地に対し 3:1 以上（SC 1.4.11 非テキスト）", () => {
      for (const h of HUES) {
        for (const mode of ["light", "dark"] as const) {
          const r = contrastRatio(pair(h, "solid")[mode], PAGE_BG[mode]);
          expect(r, `hue ${h} / ${mode}`).toBeGreaterThanOrEqual(3);
        }
      }
    });

    it("輪郭・選択枠は面に対し 3:1 以上（SC 1.4.11 UI 部品の状態）", () => {
      for (const h of HUES) {
        for (const mode of ["light", "dark"] as const) {
          const r = contrastRatio(
            pair(h, "outline")[mode],
            pair(h, "surface")[mode],
          );
          expect(r, `hue ${h} / ${mode}`).toBeGreaterThanOrEqual(3);
        }
      }
    });
  });

  describe("眩しさの上限（WCAG に規定が無いので自分たちで決めたルール）", () => {
    it("ダークの面はページ地に対し 3:1 以下（Material のダークコンテナ相当）", () => {
      for (const h of HUES) {
        const r = contrastRatio(pair(h, "surface").dark, PAGE_BG.dark);
        expect(r, `hue ${h}`).toBeLessThanOrEqual(3);
      }
    });

    it("hover でも上限を超えない", () => {
      for (const h of HUES) {
        const r = contrastRatio(pair(h, "surfaceHover").dark, PAGE_BG.dark);
        expect(r, `hue ${h}`).toBeLessThanOrEqual(3);
      }
    });
  });

  describe("色相によるばらつき（OKLCH に替えた目的そのもの）", () => {
    // HSL 時代は同じ指定でも色相で 3.8 倍ぶれていた（黄 1.9:1 / 青 7.2:1）。
    it("同じ役割なら、色相が変わってもコントラストが 1.3 倍以内に収まる", () => {
      for (const role of ["surface", "onSurface", "solid"] as const) {
        for (const mode of ["light", "dark"] as const) {
          const ratios = HUES.map((h) =>
            contrastRatio(pair(h, role)[mode], PAGE_BG[mode]),
          );
          const spread = Math.max(...ratios) / Math.min(...ratios);
          expect(spread, `${role} / ${mode}`).toBeLessThanOrEqual(1.3);
        }
      }
    });
  });

  describe("フォールバックの中立色も同じ規格を満たす", () => {
    it("文字 4.5:1・単色 3:1・ダーク面の上限 3:1", () => {
      for (const mode of ["light", "dark"] as const) {
        expect(
          contrastRatio(NEUTRAL.onSurface[mode], NEUTRAL.surface[mode]),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(NEUTRAL.solid[mode], PAGE_BG[mode]),
        ).toBeGreaterThanOrEqual(3);
      }
      expect(
        contrastRatio(NEUTRAL.surface.dark, PAGE_BG.dark),
      ).toBeLessThanOrEqual(3);
    });
  });

  describe("hueOfHex", () => {
    it("既定の費用カテゴリ色から色相を取り出せる", () => {
      // 値そのものではなく「取り出せて、赤/緑/青が別々の方角になる」を見る。
      const red = hueOfHex("#ef4444");
      const green = hueOfHex("#10b981");
      const blue = hueOfHex("#3b82f6");
      for (const h of [red, green, blue]) {
        expect(h).not.toBeNull();
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(360);
      }
      expect(red).not.toBe(green);
      expect(green).not.toBe(blue);
    });

    it("無彩色は色相なし（中立フォールバックに落ちる）", () => {
      expect(hueOfHex("#71717a")).not.toBeNull(); // zinc はわずかに青寄り
      expect(hueOfHex("#808080")).toBeNull();
      expect(hueOfHex("#ffffff")).toBeNull();
    });

    it("不正な入力は null", () => {
      expect(hueOfHex(null)).toBeNull();
      expect(hueOfHex("")).toBeNull();
      expect(hueOfHex("red")).toBeNull();
      expect(hueOfHex("#fff")).toBeNull();
    });
  });

  describe("色相の正規化", () => {
    it("範囲外・NULL は色を返さない（呼び出し側が中立にフォールバック）", () => {
      expect(roleColor(null, "surface")).toBeNull();
      expect(roleColor(undefined, "surface")).toBeNull();
      expect(roleColor(-1, "surface")).toBeNull();
      expect(roleColor(360, "surface")).toBeNull();
      expect(roleColor(NaN, "surface")).toBeNull();
    });
  });
});
