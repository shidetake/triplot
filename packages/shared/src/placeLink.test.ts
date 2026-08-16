import { describe, expect, it } from "vitest";

import { gmapsUrl } from "./placeLink";

describe("gmapsUrl", () => {
  it("Google 由来は place_id でピンポイントに開く", () => {
    expect(
      gmapsUrl({
        name: "東京駅",
        google_place_id: "ChIJC3Cf2PuLGGAROO00ukl8JwA",
        lat: 35.681,
        lng: 139.767,
      }),
    ).toBe(
      "https://www.google.com/maps/search/?api=1&query=%E6%9D%B1%E4%BA%AC%E9%A7%85&query_place_id=ChIJC3Cf2PuLGGAROO00ukl8JwA",
    );
  });

  it("手動ピン（Google 由来でない）は座標で開く", () => {
    expect(
      gmapsUrl({ name: "集合場所", google_place_id: null, lat: 35.5, lng: 139.5 }),
    ).toBe("https://www.google.com/maps/search/?api=1&query=35.5,139.5");
  });

  it("地図未登録（座標なし）は名前で検索する", () => {
    expect(
      gmapsUrl({ name: "ホテル A", google_place_id: null, lat: null, lng: null }),
    ).toBe("https://www.google.com/maps/search/?api=1&query=%E3%83%9B%E3%83%86%E3%83%AB%20A");
  });
});
