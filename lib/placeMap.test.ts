import { describe, expect, it } from "vitest";

import {
  boundsOf,
  centerOf,
  centroid,
  type ClusterInput,
  clusterPlaces,
  dominantCluster,
  type LatLng,
} from "./placeMap";

describe("centroid", () => {
  it("空配列は null", () => {
    expect(centroid([])).toBeNull();
  });

  it("1点はその点", () => {
    expect(centroid([{ lat: 35, lng: 139 }])).toEqual({ lat: 35, lng: 139 });
  });

  it("複数点は平均", () => {
    const pts: LatLng[] = [
      { lat: 0, lng: 0 },
      { lat: 10, lng: 20 },
      { lat: 20, lng: 40 },
    ];
    expect(centroid(pts)).toEqual({ lat: 10, lng: 20 });
  });
});

describe("boundsOf", () => {
  it("空配列は null", () => {
    expect(boundsOf([])).toBeNull();
  });

  it("1点は四辺ともその点", () => {
    expect(boundsOf([{ lat: 35, lng: 139 }])).toEqual({
      south: 35,
      west: 139,
      north: 35,
      east: 139,
    });
  });

  it("複数点は外接矩形", () => {
    const pts: LatLng[] = [
      { lat: 35.6, lng: 139.7 },
      { lat: 34.7, lng: 135.5 },
      { lat: 43.0, lng: 141.3 },
    ];
    expect(boundsOf(pts)).toEqual({
      south: 34.7,
      west: 135.5,
      north: 43.0,
      east: 141.3,
    });
  });

  it("負の座標も扱える", () => {
    const pts: LatLng[] = [
      { lat: -10, lng: -20 },
      { lat: 5, lng: -5 },
    ];
    expect(boundsOf(pts)).toEqual({
      south: -10,
      west: -20,
      north: 5,
      east: -5,
    });
  });

  it("太平洋を挟む2点は日付変更線跨ぎ(west>east)で最小弧を囲む", () => {
    // 成田(140.39°E) と ホノルル(-157.92°)。太平洋側(≈62°)で囲みたい。
    const pts: LatLng[] = [
      { lat: 35.77, lng: 140.39 }, // 成田
      { lat: 21.32, lng: -157.92 }, // ホノルル
    ];
    const b = boundsOf(pts)!;
    expect(b.west).toBe(140.39); // 西端=日本（左）
    expect(b.east).toBe(-157.92); // 東端=ハワイ（右）
    expect(b.west).toBeGreaterThan(b.east); // 跨ぎを示す
    expect(b.south).toBe(21.32);
    expect(b.north).toBe(35.77);
  });
});

describe("centerOf", () => {
  it("跨がない bounds は素直に中点", () => {
    expect(centerOf({ south: 0, west: 10, north: 20, east: 30 })).toEqual({
      lat: 10,
      lng: 20,
    });
  });

  it("日付変更線跨ぎ(west>east)は太平洋側の中点を返す", () => {
    // 成田↔ホノルルの中心は太平洋(≈+171°)側になるべき（大西洋側ではない）。
    const c = centerOf({ south: 21.32, west: 140.39, north: 35.77, east: -157.92 });
    expect(c.lat).toBeCloseTo(28.545, 3);
    expect(c.lng).toBeCloseTo(171.235, 3);
  });
});

describe("clusterPlaces", () => {
  const p = (
    lat: number,
    lng: number,
    region: string | null = null,
    locality: string | null = null,
  ): ClusterInput => ({ lat, lng, region, locality });

  it("空配列は空", () => {
    expect(clusterPlaces([])).toEqual([]);
  });

  it("近い2点(<100km)は1クラスタ", () => {
    // ホノルル と カイルア（≈13km）
    const cs = clusterPlaces([
      p(21.31, -157.86, "Hawaii", "Honolulu"),
      p(21.4, -157.74, "Hawaii", "Kailua"),
    ]);
    expect(cs).toHaveLength(1);
    expect(cs[0].size).toBe(2);
    expect(cs[0].label).toBe("Hawaii");
  });

  it("遠い2点(>100km)は2クラスタ", () => {
    // 成田 と ホノルル
    const cs = clusterPlaces([
      p(35.77, 140.39, "Chiba", "Narita"),
      p(21.31, -157.86, "Hawaii", "Honolulu"),
    ]);
    expect(cs).toHaveLength(2);
  });

  it("単リンク：隙間<100kmが連続すれば総延長>100kmでも1クラスタ", () => {
    // 赤道上で 0.7°(≈78km)刻み。端から端は ≈156km だが連結する。
    const cs = clusterPlaces([p(0, 0), p(0, 0.7), p(0, 1.4)]);
    expect(cs).toHaveLength(1);
    expect(cs[0].size).toBe(3);
  });

  it("同じ州に別クラスタが2つある時だけ市名で補足", () => {
    // LA と SF（≈560km）。どちらも California。
    const cs = clusterPlaces([
      p(34.05, -118.24, "California", "Los Angeles"),
      p(34.04, -118.25, "California", "Los Angeles"),
      p(37.77, -122.42, "California", "San Francisco"),
    ]);
    expect(cs).toHaveLength(2);
    const labels = cs.map((c) => c.label).sort();
    expect(labels).toEqual([
      "California / Los Angeles",
      "California / San Francisco",
    ]);
  });

  it("サイズ降順で返す（主役が先頭）", () => {
    const cs = clusterPlaces([
      p(21.31, -157.86, "Hawaii", "Honolulu"),
      p(21.4, -157.74, "Hawaii", "Kailua"),
      p(21.35, -157.9, "Hawaii", "Honolulu"),
      p(35.77, 140.39, "Chiba", "Narita"),
    ]);
    expect(cs[0].size).toBe(3);
    expect(cs[0].label).toBe("Hawaii");
  });
});

describe("dominantCluster", () => {
  const p = (lat: number, lng: number): ClusterInput => ({
    lat,
    lng,
    region: null,
    locality: null,
  });

  it("最多が単独最大なら主役を返す（ハワイ3 vs 成田1）", () => {
    const cs = clusterPlaces([
      p(21.31, -157.86),
      p(21.4, -157.74),
      p(21.35, -157.9),
      p(35.77, 140.39),
    ]);
    expect(dominantCluster(cs)?.size).toBe(3);
  });

  it("同数で割れていれば null（1+1 → 全体fit）", () => {
    const cs = clusterPlaces([p(35.77, 140.39), p(21.31, -157.86)]);
    expect(dominantCluster(cs)).toBeNull();
  });

  it("1クラスタならそれ", () => {
    const cs = clusterPlaces([p(21.31, -157.86), p(21.4, -157.74)]);
    expect(dominantCluster(cs)?.size).toBe(2);
  });
});
