import { describe, expect, it } from "vitest";

import { matchPlace, nameTokens, type TripPlace } from "./placeMatch";

const places: TripPlace[] = [
  { id: "kai", name: "Kai Coffee", formattedAddress: "2490 Kalakaua Ave, Honolulu, HI" },
  { id: "yard", name: "Yard House", formattedAddress: "226 Lewers St, Honolulu, HI" },
];

describe("nameTokens", () => {
  it("小文字化・店舗番号・記号・法人格を落とす", () => {
    expect(nameTokens("Howzit Brewing #tE1N")).toEqual(["howzit", "brewing", "te1n"]);
    expect(nameTokens("ALO Yoga, LLC")).toEqual(["alo", "yoga"]);
  });
});

describe("matchPlace", () => {
  it("表記揺れ（支店名サフィックス付き）でも既存 place に当たる", () => {
    const m = matchPlace(
      { merchant: "KAI COFFEE ALOHILANI - K", location: null },
      places,
    );
    expect(m?.placeId).toBe("kai");
  });

  it("住所が一致するとスコアが上がる", () => {
    const withAddr = matchPlace(
      { merchant: "Kai Coffee", location: "2490 Kalakaua Ave" },
      places,
    );
    expect(withAddr?.placeId).toBe("kai");
    expect(withAddr!.score).toBeGreaterThan(1);
  });

  it("無関係な店は null（新規/手動）", () => {
    expect(matchPlace({ merchant: "Uber", location: null }, places)).toBeNull();
  });

  it("正規化後に完全一致なら最有力", () => {
    const m = matchPlace({ merchant: "yard house", location: null }, places);
    expect(m?.placeId).toBe("yard");
  });
});
