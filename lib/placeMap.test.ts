import { describe, expect, it } from "vitest";

import { boundsOf, centerOf, centroid, type LatLng } from "./placeMap";

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
