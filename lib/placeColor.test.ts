import { describe, it, expect } from "vitest";

import {
  GRAY_HEX,
  hexToKmlColor,
  parseHexColor,
  rgbToKmlColor,
} from "./placeColor";

describe("parseHexColor", () => {
  it("#rrggbb をパースする", () => {
    expect(parseHexColor("#6b7280")).toEqual({ r: 107, g: 114, b: 128 });
    expect(parseHexColor("#0005ff")).toEqual({ r: 0, g: 5, b: 255 });
  });

  it("# 無し・3桁ショートハンドも受ける", () => {
    expect(parseHexColor("ff0000")).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseHexColor("#abc")).toEqual({ r: 170, g: 187, b: 204 });
  });

  it("null・無効値はグレーにフォールバック", () => {
    const gray = parseHexColor(GRAY_HEX);
    expect(parseHexColor(null)).toEqual(gray);
    expect(parseHexColor("")).toEqual(gray);
    expect(parseHexColor("not-a-color")).toEqual(gray);
    expect(parseHexColor("#12")).toEqual(gray);
  });
});

describe("rgbToKmlColor", () => {
  it("ABGR 順（aabbggrr）で出す", () => {
    expect(rgbToKmlColor({ r: 1, g: 2, b: 3 })).toBe("ff030201");
  });

  it("alpha を指定できる", () => {
    expect(rgbToKmlColor({ r: 0, g: 0, b: 0 }, 0)).toBe("00000000");
  });
});

describe("hexToKmlColor", () => {
  it("16進から ABGR を一発で出す", () => {
    // #c32222 → r=195,g=34,b=34 → ff 22 22 c3
    expect(hexToKmlColor("#c32222")).toBe("ff2222c3");
  });

  it("null はグレーの ABGR", () => {
    expect(hexToKmlColor(null)).toBe(hexToKmlColor(GRAY_HEX));
  });
});
