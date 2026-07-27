import { describe, expect, it } from "vitest";

import { computeScaleBar } from "./mapScale";
import type { MapRegion } from "./mapLabelLayout";

const view = { width: 300, height: 600 };

describe("computeScaleBar", () => {
  it("赤道付近では 1/2/5 刻みの綺麗な距離とそれに応じたバー幅を返す", () => {
    const region: MapRegion = {
      latitude: 0,
      longitude: 0,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
    const bar = computeScaleBar(region, view, 100);
    expect(bar).not.toBeNull();
    expect(bar!.unit).toBe("m");
    // 100px 分の実距離(約371m)以下で一番大きい 1/2/5 刻みの数 = 200m。
    expect(bar!.value).toBe(200);
    expect(bar!.widthPx).toBeLessThanOrEqual(100);
    expect(bar!.widthPx).toBeGreaterThan(50);
  });

  it("ズームアウトすると km 単位に切り替わる", () => {
    const region: MapRegion = {
      latitude: 35,
      longitude: 135,
      latitudeDelta: 1,
      longitudeDelta: 1,
    };
    const bar = computeScaleBar(region, view, 100);
    expect(bar).not.toBeNull();
    expect(bar!.unit).toBe("km");
    expect(bar!.value).toBeGreaterThan(0);
    expect(bar!.widthPx).toBeLessThanOrEqual(100);
  });

  it("緯度が高いほど同じ経度スパンの実距離は縮む（メルカトル近似）", () => {
    const low: MapRegion = {
      latitude: 0,
      longitude: 0,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
    const high: MapRegion = { ...low, latitude: 60 };
    const barLow = computeScaleBar(low, view, 100)!;
    const barHigh = computeScaleBar(high, view, 100)!;
    // 同じ画面幅(px)が表す実距離は高緯度ほど短くなる。
    expect(barHigh.value * (barHigh.unit === "km" ? 1000 : 1)).toBeLessThan(
      barLow.value * (barLow.unit === "km" ? 1000 : 1),
    );
  });

  it("ビュー幅が0以下なら null", () => {
    const region: MapRegion = {
      latitude: 0,
      longitude: 0,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
    expect(computeScaleBar(region, { width: 0, height: 600 }, 100)).toBeNull();
  });
});
