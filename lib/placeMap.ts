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
  let { lat: south, lng: west } = points[0];
  let north = south;
  let east = west;
  for (const p of points) {
    if (p.lat < south) south = p.lat;
    if (p.lat > north) north = p.lat;
    if (p.lng < west) west = p.lng;
    if (p.lng > east) east = p.lng;
  }
  return { south, west, north, east };
}
