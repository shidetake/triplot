// 検索候補ピン（本家 Google マップの検索結果ピンと同形＝ピル＋丸のカテゴリ
// グリフ＋評価値＋下向きの尻尾）の寸法と配色。web / RN の両方が同じ値を見る
// （ui-guidelines「地図・Google 連携まわりのビジュアルは Google に合わせる」）。
//
// 選択中は本家と同じく大きさを変えず配色を反転して示す（ピル地が赤になり、丸が
// 白抜きになる）。ダークの配色は本家ダークのスクリーンショット実測値、ライトは
// 同じ反転則をライト配色に写したもの。

export const CANDIDATE_PIN = {
  pillHeight: 30,
  circle: 26,
  glyph: 16,
  pad: 2,
  ratingGap: 3,
  ratingWidth: 25, // "4.6" ＝ 3文字 × fontSize 13 × 0.6 + 予備
  ratingPadRight: 8,
  fontSize: 13,
  tailWidth: 12,
  tailHeight: 5,
};

// 配色（pill 地 / circle 丸 / glyph 丸中のグリフ / text 評価値）。
export const CANDIDATE_COLORS = {
  light: {
    normal: { pill: "#fff", circle: "#EA4335", glyph: "#fff", text: "#202124" },
    selected: {
      pill: "#EA4335",
      circle: "#fff",
      glyph: "#EA4335",
      text: "#fff",
    },
  },
  dark: {
    normal: {
      pill: "#5A616F",
      circle: "#DD6E62",
      glyph: "#202124",
      text: "#fff",
    },
    selected: {
      pill: "#DD6E62",
      circle: "#fff",
      glyph: "#DD6E62",
      text: "#fff",
    },
  },
};

// ピン箱（先端＝下端中央）の実寸。mapLabelLayout の LabelLayoutItem.pin と
// マーカーの絶対配置の両方がこれを使う（実測でなく数値で確定させる）。
// 選択で大きさは変わらない。
export function candidatePinSize(rating: number | null): {
  width: number;
  height: number;
} {
  const c = CANDIDATE_PIN;
  const pillWidth =
    rating != null
      ? c.pad + c.circle + c.ratingGap + c.ratingWidth + c.ratingPadRight
      : c.pad + c.circle + c.pad;
  return { width: pillWidth, height: c.pillHeight + c.tailHeight };
}

// 候補ピンに添える店名ラベルの文字設定（衝突計算と描画で共有）。
export const CANDIDATE_LABEL = { fontSize: 13, lineHeight: 16, maxWidth: 130 };
// ピンとラベルの間隔（px）。
export const CANDIDATE_LABEL_GAP = 4;
