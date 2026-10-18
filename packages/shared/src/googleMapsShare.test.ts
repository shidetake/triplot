import { describe, expect, it } from "vitest";

import {
  cidFromFtid,
  cidOfMapsUri,
  findGoogleMapsUrl,
  isShortMapsUrl,
  parseGoogleMapsUrl,
  pickByCid,
} from "./googleMapsShare";

// Google マップのアプリで「共有」→「コピー」した実データを開いた先（2026-10-18）。
const RESOLVED =
  "https://www.google.com/maps?q=%E3%80%92604-8847+%E4%BA%AC%E9%83%BD%E5%BA%9C%E4%BA%AC%E9%83%BD%E5%B8%82%E4%B8%AD%E4%BA%AC%E5%8C%BA%E5%A3%AC%E7%94%9F%E8%A5%BF%E5%9C%9F%E5%B1%85%E3%83%8E%E5%86%85%E7%94%BA%EF%BC%92%EF%BC%90%E2%88%92%EF%BC%91+%E3%83%88%E3%83%A9%E3%83%A0&ftid=0x6001079cb848aa3f:0xbe53753039dde7a0&entry=gps&g_st=ic";

describe("findGoogleMapsUrl", () => {
  it("共有のテキストから URL を取り出す", () => {
    expect(
      findGoogleMapsUrl("トラム\nhttps://maps.app.goo.gl/cRWJEEY7seTV2Qhy9?g_st=ic"),
    ).toBe("https://maps.app.goo.gl/cRWJEEY7seTV2Qhy9?g_st=ic");
    expect(findGoogleMapsUrl("https://www.google.com/maps/place/Foo/@1,2,3z")).toBe(
      "https://www.google.com/maps/place/Foo/@1,2,3z",
    );
    expect(findGoogleMapsUrl("https://example.com/maps")).toBeNull();
  });

  it("短縮 URL かどうか", () => {
    expect(isShortMapsUrl("https://maps.app.goo.gl/abc")).toBe(true);
    expect(isShortMapsUrl(RESOLVED)).toBe(false);
  });
});

describe("parseGoogleMapsUrl", () => {
  it("アプリの共有: 住所＋店名と CID", () => {
    expect(parseGoogleMapsUrl(RESOLVED)).toEqual({
      query: "〒604-8847 京都府京都市中京区壬生西土居ノ内町２０−１ トラム",
      cid: "13714434140263016352",
      coords: null,
    });
  });

  it("ブラウザ版の place URL: 名前と座標", () => {
    expect(
      parseGoogleMapsUrl(
        "https://www.google.com/maps/place/Yosemite+Valley/@37.7456,-119.5936,13z/data=!3m1!4b1!4m6!3m5!1s0x8096f09df58aecc5:0x2d249c2ced8003fe",
      ),
    ).toEqual({
      query: "Yosemite Valley",
      cid: BigInt("0x2d249c2ced8003fe").toString(),
      coords: { lat: 37.7456, lng: -119.5936 },
    });
  });

  it("q が座標だけなら座標として読む", () => {
    expect(parseGoogleMapsUrl("https://maps.google.com/?q=35.0,135.7")).toEqual({
      query: null,
      cid: null,
      coords: { lat: 35, lng: 135.7 },
    });
  });
});

describe("CID の照らし合わせ", () => {
  it("ftid と googleMapsUri から同じ番号が出る", () => {
    expect(cidFromFtid("0x6001079cb848aa3f:0xbe53753039dde7a0")).toBe(
      "13714434140263016352",
    );
    expect(
      cidOfMapsUri("https://maps.google.com/?cid=13714434140263016352&g_mp=x"),
    ).toBe("13714434140263016352");
  });

  it("一致する候補を選び、無ければ1件目", () => {
    const a = { id: "a", googleMapsUri: "https://maps.google.com/?cid=1" };
    const b = { id: "b", googleMapsUri: "https://maps.google.com/?cid=2" };
    expect(pickByCid([a, b], "2")?.id).toBe("b");
    expect(pickByCid([a, b], "9")?.id).toBe("a");
    expect(pickByCid([], "1")).toBeNull();
  });
});
