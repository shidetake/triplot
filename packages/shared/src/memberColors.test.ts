import { describe, expect, it } from "vitest";

import { contrastRatio } from "./colorRoles";
import { pinColors } from "./memberColors";

const HUES = Array.from({ length: 360 }, (_, i) => i);
const MODES = ["light", "dark"] as const;

// 地図ピンは面とグリフを**自分で組み合わせる**ので、ラダー単体のテスト
// （colorRoles.test.ts）を通っていても組み合わせを間違えれば読めなくなる。
// 実際、淡い面に文字色ロール（onSurface）を当てていて、ライトの未確定ピンが
// 「濃い面＋ほぼ黒のグリフ」（最悪 1.65:1）になっていた。組み合わせた後の値を
// ここで測る。
//
// 下限が 3:1 なのは、ピンの中身がカテゴリを表す**アイコン**＝非テキストの
// 図形だから（WCAG 2.2 SC 1.4.11）。本文の 4.5:1 ではない。
describe("地図ピンの配色", () => {
  it("グリフは面に対し 3:1 以上（全 360 色相 × 確定/未確定 × 両テーマ）", () => {
    for (const h of HUES) {
      for (const tentative of [false, true]) {
        const pin = pinColors(h, tentative);
        for (const mode of MODES) {
          const r = contrastRatio(pin.glyph[mode], pin.bg[mode]);
          expect(
            r,
            `hue ${h} / ${mode} / ${tentative ? "未確定" : "確定"}`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it("ライトの未確定は確定より明るい面（薄さで未確定と分かる）", () => {
    for (const h of HUES) {
      const c = contrastRatio(
        pinColors(h, true).bg.light,
        pinColors(h, false).bg.light,
      );
      expect(c, `hue ${h}`).toBeGreaterThan(1.5);
    }
  });

  it("hue が無効でも中立色で必ず描ける（点が消えない）", () => {
    for (const tentative of [false, true]) {
      const pin = pinColors(null, tentative);
      for (const mode of MODES) {
        expect(pin.bg[mode]).toMatch(/^#[0-9a-f]{6}$/i);
        expect(
          contrastRatio(pin.glyph[mode], pin.bg[mode]),
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
