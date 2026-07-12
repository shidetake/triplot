import { describe, expect, it } from "vitest";

import {
  estimateLabelBox,
  layoutLabels,
  markerGeometry,
  projectPoint,
  type LabelLayoutItem,
  type MapRegion,
} from "./mapLabelLayout";

const view = { width: 400, height: 800 };
const region: MapRegion = {
  latitude: 35,
  longitude: 135,
  latitudeDelta: 0.1,
  longitudeDelta: 0.05,
};

const PIN = { width: 64, height: 35 };
const LABEL = { width: 80, height: 16 };
const GAP = 4;

function item(
  id: string,
  lat: number,
  lng: number,
  overrides?: Partial<LabelLayoutItem>,
): LabelLayoutItem {
  return { id, lat, lng, pin: PIN, label: LABEL, ...overrides };
}

describe("projectPoint", () => {
  it("リージョン中心はビュー中心に射影される", () => {
    const p = projectPoint(region, view, { lat: 35, lng: 135 });
    expect(p.x).toBeCloseTo(200, 5);
    expect(p.y).toBeCloseTo(400, 0); // メルカトルの非線形で僅かにずれる
  });

  it("北ほど y が小さく、東ほど x が大きい", () => {
    const n = projectPoint(region, view, { lat: 35.02, lng: 135 });
    const e = projectPoint(region, view, { lat: 35, lng: 135.01 });
    expect(n.y).toBeLessThan(400);
    expect(e.x).toBeGreaterThan(200);
  });

  it("リージョンの端は 0 / 幅・高さに射影される", () => {
    const nw = projectPoint(region, view, { lat: 35.05, lng: 134.975 });
    const se = projectPoint(region, view, { lat: 34.95, lng: 135.025 });
    expect(nw.x).toBeCloseTo(0, 5);
    expect(nw.y).toBeCloseTo(0, 5);
    expect(se.x).toBeCloseTo(view.width, 5);
    expect(se.y).toBeCloseTo(view.height, 5);
  });
});

describe("estimateLabelBox", () => {
  it("短い CJK は1行（幅 ≈ 文字数 × fontSize）", () => {
    const b = estimateLabelBox("薮そば", {
      fontSize: 13,
      lineHeight: 16,
      maxWidth: 130,
    });
    expect(b).toEqual({ width: 39, height: 16, lines: 1 });
  });

  it("maxWidth を超えると2行に折り返す", () => {
    const b = estimateLabelBox("自家製麺うどん・そば 招楽", {
      fontSize: 13,
      lineHeight: 16,
      maxWidth: 130,
    });
    expect(b).toEqual({ width: 130, height: 32, lines: 2 });
  });

  it("半角は 0.55em で数える", () => {
    const b = estimateLabelBox("ABCD", {
      fontSize: 10,
      lineHeight: 16,
      maxWidth: 130,
    });
    expect(b.width).toBe(22);
  });
});

describe("markerGeometry", () => {
  it("どの placement でもピンの先端（下端中央）が anchor に一致する", () => {
    for (const pl of ["right", "left", "top", "bottom", "hidden"] as const) {
      const g = markerGeometry(pl, PIN, LABEL, GAP);
      // 先端 = ピン箱の下端中央（コンテナ内座標）
      expect(g.anchorX * g.width).toBeCloseTo(g.pinX + PIN.width / 2, 5);
      expect(g.anchorY * g.height).toBeCloseTo(g.pinY + PIN.height, 5);
    }
  });

  it("right はピンの右に gap を挟んでラベルが並ぶ", () => {
    const g = markerGeometry("right", PIN, LABEL, GAP);
    expect(g.labelX).toBe(PIN.width + GAP);
    expect(g.width).toBe(PIN.width + GAP + LABEL.width);
  });

  it("hidden はラベル無し・ピンのみの箱", () => {
    const g = markerGeometry("hidden", PIN, LABEL, GAP);
    expect(g.labelX).toBeNull();
    expect(g.width).toBe(PIN.width);
    expect(g.height).toBe(PIN.height);
  });
});

describe("layoutLabels", () => {
  it("離れた2件はどちらも第一候補（右）に置ける", () => {
    const r = layoutLabels(
      [item("a", 35.02, 134.99), item("b", 34.98, 135.01)],
      region,
      view,
      GAP,
    );
    expect(r).toEqual({ a: "right", b: "right" });
  });

  it("右隣に別のピンがあるときは左へ振る", () => {
    // b は a の右すぐ（a の右ラベルが b のピンに重なる距離）に置く。
    // 経度 0.05 = 400px → 1px ≈ 0.000125°。100px ≈ 0.0125°。
    const r = layoutLabels(
      [item("a", 35, 135), item("b", 35, 135.0125)],
      region,
      view,
      GAP,
    );
    expect(r.a).toBe("left");
    expect(r.b).toBe("right");
  });

  it("同一地点に密集すると 右→左→上→下 と埋まり、5件目は hidden", () => {
    const items = ["a", "b", "c", "d", "e"].map((id) => item(id, 35, 135));
    const r = layoutLabels(items, region, view, GAP);
    expect(r).toEqual({
      a: "right",
      b: "left",
      c: "top",
      d: "bottom",
      e: "hidden",
    });
  });

  it("先頭（優先度高）が良い位置を取る", () => {
    const r1 = layoutLabels(
      [item("sel", 35, 135), item("other", 35, 135)],
      region,
      view,
      GAP,
    );
    expect(r1.sel).toBe("right");
    expect(r1.other).toBe("left");
  });
});
