import { hueOfHex, roleColor } from "./colorRoles";

// カスタムの費用カテゴリに割り当てる色を決める。
//
// メンバー色（SQL の `pick_member_color`）と**同じ farthest-point 配置**:
// 既に使われている色相から角度距離が最大になる色相を選ぶ。既定の11色は色相環に
// 30〜35° 間隔で置いてあるので、その隙間の真ん中が順に埋まっていく。
//
// 以前はカスタムを全部同じ青で作っていた。バッジは隣に名前があるので済んで
// いたが、色が主役になる円グラフでは同じ色の切れが並んで見分けられない。
//
// 無彩色（未分類）は色相を持たないので、使用済みから外れる＝カスタクが
// そこを避ける必要はない。

/** 使用済みの色相（度）から、一番離れた色相を選ぶ。 */
export function pickCategoryHue(usedHues: number[]): number {
  // まだ何も使われていなければ 0°（この状況は既定カテゴリがある限り起きない）。
  if (usedHues.length === 0) return 0;

  let bestHue = 0;
  let bestDist = -1;
  for (let h = 0; h < 360; h++) {
    let minD = 360;
    for (const u of usedHues) {
      const raw = Math.abs(h - u);
      const d = raw > 180 ? 360 - raw : raw;
      if (d < minD) minD = d;
    }
    if (minD > bestDist) {
      bestDist = minD;
      bestHue = h;
    }
  }
  return bestHue;
}

/**
 * 同じ旅行の既存カテゴリの色（hex）から、新しいカテゴリの色（hex）を決める。
 * 保存するのは hex だが、読む側は色相しか見ない（colorRoles の役割ラダーが
 * 明度・彩度を決める）ので、選んだ色相をそのまま持つ hex を入れておく。
 */
export function pickCategoryColor(usedColors: (string | null)[]): string {
  const usedHues = usedColors
    .map((c) => hueOfHex(c))
    .filter((h): h is number => h !== null);
  const hue = pickCategoryHue(usedHues);
  // ライト側の solid を代表値として持つ（色相さえ合っていれば何でもよい）。
  return roleColor(hue, "solid")!.light;
}
