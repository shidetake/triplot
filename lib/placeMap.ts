// 地図の中心・表示範囲の計算（DB を触らない純粋関数）。
// place-map.tsx から切り出してユニットテスト可能にする。

export type LatLng = { lat: number; lng: number };

export type Bounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

// 東京駅。ピンが 1 つも無いときの初期中心。
export const TOKYO: LatLng = { lat: 35.681236, lng: 139.767125 };

export function centroid(points: LatLng[]): LatLng | null {
  if (points.length === 0) return null;
  const sum = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

export function boundsOf(points: LatLng[]): Bounds | null {
  if (points.length === 0) return null;

  // 緯度は素直に min/max。
  let south = points[0].lat;
  let north = points[0].lat;
  for (const p of points) {
    if (p.lat < south) south = p.lat;
    if (p.lat > north) north = p.lat;
  }

  // 経度は「全点を囲む最小の弧」を採る。素朴な min/max だと、成田(≈140°E)と
  // ホノルル(≈-158°)のように太平洋を挟む2点で逆回り(298°)を囲んでしまい
  // 無駄に引いた画角になる。経度を円環とみなし、最大の空きギャップを除いた
  // 残り(=最小の弧)を bounds とする。日付変更線(180°)を跨ぐ方が短ければ
  // west>east を返す（Google Maps はこれを跨ぎとして解釈する）。
  const lngs = points.map((p) => p.lng).sort((a, b) => a - b);
  // 初期値は「末尾→先頭」を東回り(180°跨ぎ)で結ぶギャップ。
  let west = lngs[0];
  let east = lngs[lngs.length - 1];
  let maxGap = lngs[0] + 360 - lngs[lngs.length - 1];
  for (let i = 0; i < lngs.length - 1; i++) {
    const gap = lngs[i + 1] - lngs[i];
    if (gap > maxGap) {
      maxGap = gap;
      // このギャップが空き = 残りの弧は次の点から手前の点まで(東回り)。
      west = lngs[i + 1];
      east = lngs[i];
    }
  }

  return { south, west, north, east };
}

/** bounds の中心。west>east（日付変更線跨ぎ）も正しく扱う。 */
export function centerOf(b: Bounds): LatLng {
  const lat = (b.south + b.north) / 2;
  let lng: number;
  if (b.west <= b.east) {
    lng = (b.west + b.east) / 2;
  } else {
    // 跨ぎ：east 側に 360 足して中点を取り、[-180,180] へ正規化。
    lng = (b.west + b.east + 360) / 2;
    if (lng > 180) lng -= 360;
  }
  return { lat, lng };
}
