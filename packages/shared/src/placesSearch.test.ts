import { describe, expect, it } from "vitest";

import { extractRegion, nearestCandidate, type PlaceCandidate } from "./placesSearch";

function candidate(p: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    placeId: "g1",
    name: "成田国際空港",
    formattedAddress: "千葉県成田市",
    lat: 35.7647,
    lng: 140.3864,
    region: "千葉県",
    locality: "成田市",
    rating: null,
    userRatingCount: null,
    primaryType: "airport",
    ...p,
  };
}

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

describe("nearestCandidate", () => {
  const coords = { lat: 35.7647, lng: 140.3864 }; // 成田国際空港

  it("先頭候補が十分近ければ採用する", () => {
    expect(nearestCandidate([candidate()], coords)).toEqual(candidate());
  });

  it("先頭候補が離れすぎていれば null（無関係な場所との誤マッチを避ける）", () => {
    const farAway = candidate({ lat: 21.32, lng: -157.92 }); // ホノルル
    expect(nearestCandidate([farAway], coords)).toBeNull();
  });

  it("候補が無ければ null", () => {
    expect(nearestCandidate([], coords)).toBeNull();
  });
});
