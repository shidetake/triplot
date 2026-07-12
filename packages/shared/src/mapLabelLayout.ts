// 地図上の候補ピンに添える店名ラベルの配置計算（DB を触らない純粋関数）。
// 本家 Google マップの「ラベルを左右に振り分け、置けない分は隠す」衝突回避を
// JS 側で再現する。地図側はリージョン確定（パン/ズーム終了）ごとに呼び直す。

import type { LatLng } from "./placeMap";

// react-native-maps の Region と同形（緯度経度スパンで表す表示範囲）。
export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type Size = { width: number; height: number };

export type LabelPlacement = "right" | "left" | "top" | "bottom" | "hidden";

type Rect = { x: number; y: number; w: number; h: number };

function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

// メルカトルの y（緯度方向は非線形）。±85° にクランプ（tan の発散避け）。
function mercatorY(latDeg: number): number {
  const lat = Math.max(-85, Math.min(85, latDeg));
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
}

/** region + ビュー実寸 (px) → 画面座標 (px)。 */
export function projectPoint(
  region: MapRegion,
  view: Size,
  p: LatLng,
): { x: number; y: number } {
  const top = mercatorY(region.latitude + region.latitudeDelta / 2);
  const bottom = mercatorY(region.latitude - region.latitudeDelta / 2);
  const left = region.longitude - region.longitudeDelta / 2;
  return {
    x: ((p.lng - left) / region.longitudeDelta) * view.width,
    y: ((top - mercatorY(p.lat)) / (top - bottom)) * view.height,
  };
}

// ラベルのテキスト箱の見積もり（実測せず数値で決める。CJK≈1em・半角≈0.55em）。
// maxWidth を超えたら2行に折り返す（それ以上は描画側の ellipsis 任せ）。
export function estimateLabelBox(
  text: string,
  opts: { fontSize: number; lineHeight: number; maxWidth: number },
): { width: number; height: number; lines: number } {
  let units = 0;
  for (const ch of text) units += (ch.codePointAt(0) ?? 0) > 0xff ? 1 : 0.55;
  const w = Math.ceil(units * opts.fontSize);
  if (w <= opts.maxWidth) {
    return { width: w, height: opts.lineHeight, lines: 1 };
  }
  return { width: opts.maxWidth, height: opts.lineHeight * 2, lines: 2 };
}

// 1マーカー（ピン＋ラベル）の内部レイアウト。ピンの先端（座標に刺さる点）は
// ピン箱の下端中央。anchor は Marker.anchor に渡す割合（先端の位置）。
// 衝突計算（layoutLabels）と描画側が同じ形を共有するための単一の真実。
export type MarkerGeometry = {
  width: number;
  height: number;
  pinX: number;
  pinY: number;
  labelX: number | null;
  labelY: number | null;
  anchorX: number;
  anchorY: number;
};

export function markerGeometry(
  placement: LabelPlacement,
  pin: Size,
  label: Size,
  gap: number,
): MarkerGeometry {
  switch (placement) {
    case "hidden":
      return {
        width: pin.width,
        height: pin.height,
        pinX: 0,
        pinY: 0,
        labelX: null,
        labelY: null,
        anchorX: 0.5,
        anchorY: 1,
      };
    case "right": {
      const width = pin.width + gap + label.width;
      const height = Math.max(pin.height, label.height);
      const pinY = (height - pin.height) / 2;
      return {
        width,
        height,
        pinX: 0,
        pinY,
        labelX: pin.width + gap,
        labelY: (height - label.height) / 2,
        anchorX: pin.width / 2 / width,
        anchorY: (pinY + pin.height) / height,
      };
    }
    case "left": {
      const width = label.width + gap + pin.width;
      const height = Math.max(pin.height, label.height);
      const pinY = (height - pin.height) / 2;
      return {
        width,
        height,
        pinX: label.width + gap,
        pinY,
        labelX: 0,
        labelY: (height - label.height) / 2,
        anchorX: (label.width + gap + pin.width / 2) / width,
        anchorY: (pinY + pin.height) / height,
      };
    }
    case "top": {
      const width = Math.max(pin.width, label.width);
      const height = label.height + gap + pin.height;
      return {
        width,
        height,
        pinX: (width - pin.width) / 2,
        pinY: label.height + gap,
        labelX: (width - label.width) / 2,
        labelY: 0,
        anchorX: 0.5,
        anchorY: 1,
      };
    }
    case "bottom": {
      const width = Math.max(pin.width, label.width);
      const height = pin.height + gap + label.height;
      return {
        width,
        height,
        pinX: (width - pin.width) / 2,
        pinY: 0,
        labelX: (width - label.width) / 2,
        labelY: pin.height + gap,
        anchorX: 0.5,
        anchorY: pin.height / height,
      };
    }
  }
}

export type LabelLayoutItem = {
  id: string;
  lat: number;
  lng: number;
  pin: Size; // ピン箱（先端＝下端中央）
  label: Size;
};

// placement 候補のラベル矩形（画面座標）。markerGeometry から導出することで
// 衝突判定と実描画のズレを無くす。
function labelRect(
  placement: Exclude<LabelPlacement, "hidden">,
  pt: { x: number; y: number },
  item: LabelLayoutItem,
  gap: number,
): Rect {
  const g = markerGeometry(placement, item.pin, item.label, gap);
  return {
    x: pt.x - g.anchorX * g.width + (g.labelX ?? 0),
    y: pt.y - g.anchorY * g.height + (g.labelY ?? 0),
    w: item.label.width,
    h: item.label.height,
  };
}

/**
 * greedy 配置。渡した順が優先度（先頭ほど良い位置を取る）。右→左→上→下の
 * 順に試し、他のピン・既配置ラベルと重なるものは次へ。全滅なら hidden
 * （ピンだけ出す）。ピン自体は全件常に表示される前提で衝突対象に含める。
 */
export function layoutLabels(
  items: LabelLayoutItem[],
  region: MapRegion,
  view: Size,
  gap: number,
): Record<string, LabelPlacement> {
  const pts = items.map((it) => projectPoint(region, view, it));
  const pinRects: Rect[] = items.map((it, i) => ({
    x: pts[i].x - it.pin.width / 2,
    y: pts[i].y - it.pin.height,
    w: it.pin.width,
    h: it.pin.height,
  }));
  const placedLabels: Rect[] = [];
  const result: Record<string, LabelPlacement> = {};
  items.forEach((it, i) => {
    let chosen: LabelPlacement = "hidden";
    for (const pl of ["right", "left", "top", "bottom"] as const) {
      const r = labelRect(pl, pts[i], it, gap);
      const hitsPin = pinRects.some((pr, j) => j !== i && intersects(r, pr));
      if (!hitsPin && !placedLabels.some((lr) => intersects(r, lr))) {
        chosen = pl;
        placedLabels.push(r);
        break;
      }
    }
    result[it.id] = chosen;
  });
  return result;
}
