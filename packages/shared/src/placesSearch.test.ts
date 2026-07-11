import { describe, expect, it } from "vitest";

import { extractRegion } from "./placesSearch";

describe("extractRegion", () => {
  it("州/県と市を取り出す", () => {
    expect(
      extractRegion([
        { types: ["administrative_area_level_1"], longText: "Hawaii" },
        { types: ["locality"], longText: "Honolulu" },
      ]),
    ).toEqual({ region: "Hawaii", locality: "Honolulu" });
  });

  it("locality が無ければ sublocality_level_1 にフォールバックする", () => {
    expect(
      extractRegion([
        { types: ["administrative_area_level_1"], longText: "東京都" },
        { types: ["sublocality_level_1"], longText: "千代田区" },
      ]),
    ).toEqual({ region: "東京都", locality: "千代田区" });
  });

  it("types を持たない成分が混ざっても落ちない（実機で TypeError になった実データ形）", () => {
    expect(
      extractRegion([
        { longText: "日本" },
        { types: null, longText: "〒100-0001" },
        { types: ["locality"], longText: "千代田区" },
      ]),
    ).toEqual({ region: null, locality: "千代田区" });
  });

  it("null / undefined / 空配列は両方 null", () => {
    expect(extractRegion(null)).toEqual({ region: null, locality: null });
    expect(extractRegion(undefined)).toEqual({ region: null, locality: null });
    expect(extractRegion([])).toEqual({ region: null, locality: null });
  });
});
