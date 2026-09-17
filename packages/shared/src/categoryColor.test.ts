import { describe, expect, it } from "vitest";

import { pickCategoryColor, pickCategoryHue } from "./categoryColor";
import { hueOfHex } from "./colorRoles";

// 既定カテゴリの色（seed_default_expense_categories と同値）。
const DEFAULT_COLORS = [
  "#398ad6", // 渡航 250°
  "#0096af", // 現地移動 215°
  "#c7692c", // 飲食 50°
  "#a569bf", // 衣服 315°
  "#c06099", // レジャー 345°
  "#399d57", // 土産 150°
  "#7f78d6", // 宿泊 285°
  "#009b8f", // 通信 185°
  "#cd5f62", // 医療 20°
  "#ae7c00", // カジノ 80°
  "#848f02", // その他 115°
  "#808080", // 未分類（無彩色）
];

// 色相の集合について「一番近い隣までの距離」。散らばりの良さの指標。
function minGap(hues: number[]): number {
  let min = 360;
  for (let i = 0; i < hues.length; i++) {
    for (let j = i + 1; j < hues.length; j++) {
      const raw = Math.abs(hues[i] - hues[j]);
      const d = raw > 180 ? 360 - raw : raw;
      if (d < min) min = d;
    }
  }
  return min;
}

describe("pickCategoryHue", () => {
  it("1つだけ使われていれば正反対を選ぶ", () => {
    expect(pickCategoryHue([0])).toBe(180);
  });

  it("2つの間が空いていればその中点を選ぶ", () => {
    expect(pickCategoryHue([0, 180])).toBe(90);
  });

  it("一番広い隙間を埋める", () => {
    // 0..90 が詰まっていて、90..360 が空いている。
    expect(pickCategoryHue([0, 30, 60, 90])).toBe(225);
  });
});

describe("pickCategoryColor", () => {
  it("無彩色（未分類）は使用済みに数えない", () => {
    // グレーだけなら「何も使われていない」と同じ扱い。
    expect(hueOfHex("#808080")).toBeNull();
    expect(pickCategoryColor(["#808080"])).toBe(pickCategoryColor([]));
  });

  it("既定12色に足すと、既定のどの色相からも十分離れる", () => {
    const hue = hueOfHex(pickCategoryColor(DEFAULT_COLORS))!;
    const defaults = DEFAULT_COLORS.map(hueOfHex).filter(
      (h): h is number => h !== null,
    );
    expect(minGap([...defaults, hue])).toBeGreaterThanOrEqual(15);
  });

  it("カスタムを足していっても同じ色相が2度出ない", () => {
    const colors = [...DEFAULT_COLORS];
    for (let i = 0; i < 6; i++) colors.push(pickCategoryColor(colors));
    const hues = colors
      .map(hueOfHex)
      .filter((h): h is number => h !== null)
      .sort((a, b) => a - b);
    expect(new Set(hues).size).toBe(hues.length);
    // 既定の最小間隔（30°）の半分は空く＝隣と見分けが付く。
    expect(minGap(hues)).toBeGreaterThanOrEqual(15);
  });
});
