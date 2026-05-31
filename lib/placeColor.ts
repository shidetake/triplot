// place のピン色は status.color（CSS の16進文字列, 例 "#6b7280"）で表す。
// UI ではこの色をそのまま使う（place-list の ColorBadge / place-map のピン）。
// エクスポート（KML の <color> / ピン画像）でも同じ色を再現するための変換。
// ※ メンバー色は hue（数値）だが place の status 色は16進文字列。別物。

export type Rgb = { r: number; g: number; b: number };

// status 未設定や無効値のフォールバック。UI の "#6b7280" と揃える。
export const GRAY_HEX = "#6b7280";

// "#rrggbb" / "#rgb" → RGB（0–255）。null・無効はグレーにフォールバック。
export function parseHexColor(hex: string | null | undefined): Rgb {
  if (!hex) return parseHexColor(GRAY_HEX);
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return parseHexColor(GRAY_HEX);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

// KML の <color> は ABGR 順（aabbggrr）の16進。RGBA ではないので注意。
export function rgbToKmlColor({ r, g, b }: Rgb, alpha = 255): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `${h(alpha)}${h(b)}${h(g)}${h(r)}`;
}

// 便利: 16進カラー → KML の ABGR。
export function hexToKmlColor(hex: string | null | undefined): string {
  return rgbToKmlColor(parseHexColor(hex));
}
