import { describe, expect, it } from "vitest";

import { boundsOf, centroid, type LatLng } from "./placeMap";

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
});
