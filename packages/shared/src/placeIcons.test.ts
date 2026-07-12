import { describe, expect, it } from "vitest";

import {
  GOOGLE_TYPE_ICON,
  getIcon,
  iconKeyForGoogleType,
} from "./placeIcons";

describe("iconKeyForGoogleType", () => {
  it("対応表の値は全部カタログに存在する（不変条件）", () => {
    for (const [type, key] of Object.entries(GOOGLE_TYPE_ICON)) {
      expect(getIcon(key), `${type} → ${key}`).toBeDefined();
    }
  });

  it("代表的な type を引ける", () => {
    expect(iconKeyForGoogleType("restaurant")).toBe("food");
    expect(iconKeyForGoogleType("coffee_shop")).toBe("cafe");
    expect(iconKeyForGoogleType("hotel")).toBe("lodging");
    expect(iconKeyForGoogleType("train_station")).toBe("station");
    expect(iconKeyForGoogleType("shinto_shrine")).toBe("temple_buddhist");
  });

  it("個別対応の無い type は suffix で系統に落ちる", () => {
    expect(iconKeyForGoogleType("italian_restaurant")).toBe("food");
    expect(iconKeyForGoogleType("book_store")).toBe("shopping");
    expect(iconKeyForGoogleType("gift_shop")).toBe("shopping");
    expect(iconKeyForGoogleType("international_train_station")).toBe(
      "station",
    );
  });

  it("未知・null は汎用の pin", () => {
    expect(iconKeyForGoogleType("unknown_type_xyz")).toBe("pin");
    expect(iconKeyForGoogleType(null)).toBe("pin");
    expect(iconKeyForGoogleType(undefined)).toBe("pin");
  });
});
