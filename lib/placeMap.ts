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

// ──────────────────────────────────────────────
// 地点クラスタリング（地図のエリアチップ用）
// ──────────────────────────────────────────────

// クラスタ連結のしきい値(km)。隣接ピン同士の間隔がこれ未満なら同じクラスタに
// 連結する（単リンク）。連続して埋まれば数珠つなぎで1つ、大きな隙間で割れる。
// 旅行の「エリア」は概ね100km以内、別の「脚」は数百km以上離れる前提。後で調整。
export const CLUSTER_GAP_KM = 100;

export type ClusterInput = {
  lat: number;
  lng: number;
  region: string | null; // 都道府県/州（administrative_area_level_1）
  locality: string | null; // 市
};

export type Cluster = {
  points: ClusterInput[];
  size: number;
  bounds: Bounds;
  // 地域ラベル。原則は「メンバー共通の region」。同じ region のクラスタが
  // 複数ある時だけ市名で補足（"カリフォルニア / Los Angeles"）。地域情報が
  // 全く無いクラスタは null（UI 側でフォールバック表示）。
  label: string | null;
};

const EARTH_KM = 6371;

function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// 最頻の非 null 値（出現順で安定）。
function mode(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

function assignLabels(clusters: Cluster[]): void {
  const region = clusters.map((c) => mode(c.points.map((p) => p.region)));
  const locality = clusters.map((c) => mode(c.points.map((p) => p.locality)));
  const base = clusters.map((_, i) => region[i] ?? locality[i]);

  const baseCount = new Map<string, number>();
  for (const b of base) if (b) baseCount.set(b, (baseCount.get(b) ?? 0) + 1);

  clusters.forEach((c, i) => {
    const b = base[i];
    if (!b) {
      c.label = null;
      return;
    }
    // region が複数クラスタで衝突する時だけ市名で補足する。
    if (region[i] && (baseCount.get(b) ?? 0) > 1 && locality[i]) {
      c.label = `${b} / ${locality[i]}`;
    } else {
      c.label = b;
    }
  });
}

// 単リンク（隙間ベース）クラスタリング。サイズ降順で返す（先頭＝主役候補）。
export function clusterPlaces(
  places: ClusterInput[],
  gapKm: number = CLUSTER_GAP_KM,
): Cluster[] {
  const n = places.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) {
      const next = parent[x];
      parent[x] = r;
      x = next;
    }
    return r;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (haversineKm(places[i], places[j]) < gapKm) {
        parent[find(i)] = find(j);
      }
    }
  }

  const groups = new Map<number, ClusterInput[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const arr = groups.get(r) ?? [];
    arr.push(places[i]);
    groups.set(r, arr);
  }

  const clusters: Cluster[] = [...groups.values()].map((points) => ({
    points,
    size: points.length,
    bounds: boundsOf(points)!,
    label: null,
  }));

  assignLabels(clusters);
  clusters.sort((a, b) => b.size - a.size);
  return clusters;
}

// 既定でズームすべき「主役」クラスタ。最多ピンが単独で最大ならそれ。
// 同数で割れている（例: 1+1）等、主役が決まらなければ null（＝全体 fit）。
export function dominantCluster(clusters: Cluster[]): Cluster | null {
  if (clusters.length === 0) return null;
  if (clusters.length === 1) return clusters[0];
  const [a, b] = clusters; // size 降順
  return a.size > b.size ? a : null;
}
