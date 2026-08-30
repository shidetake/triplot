import { describe, expect, it } from "vitest";

import { matchPlace, nameTokens, type TripPlace } from "./placeMatch";

const places: TripPlace[] = [
  {
    id: "kai",
    name: "Kai Coffee",
    formattedAddress: "2490 Kalakaua Ave, Honolulu, HI",
  },
  {
    id: "yard",
    name: "Yard House",
    formattedAddress: "226 Lewers St, Honolulu, HI",
  },
];

describe("nameTokens", () => {
  it("小文字化・店舗番号・記号・法人格を落とす", () => {
    expect(nameTokens("Howzit Brewing #tE1N")).toEqual([
      "howzit",
      "brewing",
      "te1n",
    ]);
    expect(nameTokens("ALO Yoga, LLC")).toEqual(["alo", "yoga"]);
  });
});

describe("matchPlace", () => {
  it("表記揺れ（支店名サフィックス付き）でも既存 place に当たる", () => {
    const m = matchPlace(
      { merchant: "KAI COFFEE ALOHILANI - K", address: null },
      places,
    );
    expect(m?.placeId).toBe("kai");
  });

  it("住所が一致するとスコアが上がる", () => {
    const withAddr = matchPlace(
      { merchant: "Kai Coffee", address: "2490 Kalakaua Ave" },
      places,
    );
    expect(withAddr?.placeId).toBe("kai");
    expect(withAddr!.score).toBeGreaterThan(1);
  });

  it("無関係な店は null（新規/手動）", () => {
    expect(matchPlace({ merchant: "Uber", address: null }, places)).toBeNull();
  });

  it("正規化後に完全一致なら最有力", () => {
    const m = matchPlace({ merchant: "yard house", address: null }, places);
    expect(m?.placeId).toBe("yard");
  });
});

// 実データで踏んだ2つ。どちらも「別の店に吸い寄せられる」形で、同じメールから
// 出た費用と予定で場所がずれて気付きにくかった。
describe("別の店に吸い寄せられない", () => {
  const mall: TripPlace[] = [
    {
      id: "uniqlo",
      name: "UNIQLO Ala Moana",
      formattedAddress: "1450 Ala Moana Blvd #2730, Honolulu, HI 96814, USA",
    },
    {
      id: "alohilani",
      name: "Kai Coffee Alohilani",
      formattedAddress: "2490 Kalakaua Ave, Honolulu, HI",
    },
  ];

  // ALO Ala Moana と UNIQLO Ala Moana は同じビル（1450 Ala Moana Blvd）。
  // 住所で資格を与えると、名前が 0.33 しか似ていないのに閾値に乗ってしまう。
  it("同じビルの住所だけでは一致しない", () => {
    expect(
      matchPlace(
        {
          merchant: "Alo Yoga 045 Ala Moana",
          address: "1450 Ala Moana Boulevard Suite 2238 Honolulu, Hawaii 96814",
        },
        mall,
      ),
    ).toBeNull();
  });

  // "ALO" は "alohilani" の中に文字列として含まれる。語の単位で見ないと当たる。
  it("短い名前が別の語の内側に紛れ込まない", () => {
    expect(
      matchPlace({ merchant: "ALO", address: null }, mall),
    ).toBeNull();
  });
});
