import { describe, expect, it } from "vitest";

import { iconForSharedPlace } from "./sharedPlace";

describe("iconForSharedPlace", () => {
  it("推測したアイコンが旅行のピンにあればそれを使う", () => {
    expect(iconForSharedPlace("restaurant", ["pin", "food", "cafe"])).toBe(
      "food",
    );
  });

  it("推測したアイコンが旅行のピンに無ければピンにする", () => {
    expect(iconForSharedPlace("restaurant", ["pin", "cafe"])).toBe("pin");
  });

  it("種類が分からなければピンにする", () => {
    expect(iconForSharedPlace(null, ["pin", "food"])).toBe("pin");
  });
});
