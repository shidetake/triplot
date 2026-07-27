// 地図の縮尺バー（Google マップ本家の「拡大縮小した時だけ右下に出るスケール
// バー」と同じ表示のための距離計算）。DB を触らない純粋関数。region・ビュー
// 実寸から「1/2/5 刻みの綺麗な数」の実距離とその画面幅 (px) を導く
// （Leaflet の L.Control.Scale と同じアルゴリズム）。

import type { MapRegion, Size } from "./mapLabelLayout";

export type ScaleBar = {
  // 表示する距離の値とその単位（例: 50, "m"）。
  value: number;
  unit: "m" | "km";
  // その距離に相当するバーの画面幅 (px)。
  widthPx: number;
};

const METERS_PER_DEGREE_LON_AT_EQUATOR = 111_320;

// 1px あたりの実距離 (m)。経度方向の実距離は緯度で縮む（メルカトル）ので、
// 地図中心の緯度で近似する（ラベル配置の mercatorY ほど厳密でなくてよい —
// 縮尺表示は元々「目安」の情報のため）。
function metersPerPixel(region: MapRegion, view: Size): number {
  const metersPerDegreeLon =
    METERS_PER_DEGREE_LON_AT_EQUATOR *
    Math.cos((region.latitude * Math.PI) / 180);
  const widthMeters = region.longitudeDelta * metersPerDegreeLon;
  return widthMeters / view.width;
}

// 1/2/5 刻みで「maxValue 以下で一番大きい綺麗な数」に丸める
// （Leaflet の scale control と同じ丸め方）。
function niceNumber(maxValue: number): number {
  const exponent = Math.floor(Math.log10(maxValue));
  const pow10 = Math.pow(10, exponent);
  const fraction = maxValue / pow10;
  const niceFraction = fraction >= 5 ? 5 : fraction >= 2 ? 2 : 1;
  return niceFraction * pow10;
}

// region・ビュー実寸・バーの最大幅(px) → 実際に描くべき距離とバー幅。
// 東京駅通過分の 300px 未満などビュー実寸が未確定の間は null。
export function computeScaleBar(
  region: MapRegion,
  view: Size,
  maxWidthPx: number,
): ScaleBar | null {
  if (view.width <= 0 || maxWidthPx <= 0) return null;
  const mpp = metersPerPixel(region, view);
  if (!Number.isFinite(mpp) || mpp <= 0) return null;
  const maxMeters = mpp * maxWidthPx;
  if (maxMeters >= 1000) {
    const km = niceNumber(maxMeters / 1000);
    return { value: km, unit: "km", widthPx: (km * 1000) / mpp };
  }
  const m = niceNumber(maxMeters);
  return { value: m, unit: "m", widthPx: m / mpp };
}
