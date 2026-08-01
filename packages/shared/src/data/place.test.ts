import { describe, expect, it } from "vitest";

import { placeSpec } from "./place";

// placeSpec は「場所の渡し方」をアプリ全体で1つに揃える wire 契約
// （SQL 側の受け口は resolve_place_spec）。予定・費用の両方が通る。
describe("placeSpec", () => {
  it("保存済みは place_id", () => {
    expect(placeSpec({ kind: "saved", placeId: "abc" })).toEqual({ place_id: "abc" });
  });

  it("場所なしは null", () => {
    expect(placeSpec({ kind: "saved", placeId: null })).toBeNull();
    expect(placeSpec({ kind: "free", label: null })).toBeNull();
    expect(placeSpec({ kind: "free", label: "" })).toBeNull();
  });

  it("自由入力は名前だけ（座標が無ければ座標のキーを出さない）", () => {
    expect(placeSpec({ kind: "free", label: "謎の食堂" })).toEqual({
      freetext: { name: "謎の食堂" },
    });
  });

  it("座標つきの自由入力（フライトの空港）は座標とアイコンを載せる", () => {
    expect(
      placeSpec({
        kind: "free",
        label: "Tokyo Narita",
        coords: { lat: 35.7647, lng: 140.386 },
        icon: "airport",
      }),
    ).toEqual({
      freetext: {
        name: "Tokyo Narita",
        lat: 35.7647,
        lng: 140.386,
        icon: "airport",
      },
    });
  });

  it("Google 由来は google 枝。空文字は DB 側で NULL に落ちる前提", () => {
    expect(
      placeSpec({
        kind: "google",
        placeId: "gp1",
        name: "店",
        address: "住所",
        lat: 1,
        lng: 2,
        region: null,
        locality: null,
      }),
    ).toEqual({
      google: {
        google_place_id: "gp1",
        name: "店",
        lat: 1,
        lng: 2,
        formatted_address: "住所",
        icon: "",
        region: "",
        locality: "",
      },
    });
  });
});
