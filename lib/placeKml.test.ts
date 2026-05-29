import { describe, it, expect } from "vitest";

import { buildPlacesKml, type KmlPlacemark } from "./placeKml";

describe("buildPlacesKml", () => {
  it("coordinates は 経度,緯度,高度 の順で出す", () => {
    const out = buildPlacesKml("旅行", [
      { name: "東京タワー", lat: 35.6586, lng: 139.7454 },
    ]);
    expect(out).toContain("<coordinates>139.7454,35.6586,0</coordinates>");
    expect(out).toContain("<name>東京タワー</name>");
    expect(out).toContain("<name>旅行</name>");
  });

  it("description は中身があるときだけ出す", () => {
    const withDesc = buildPlacesKml("t", [
      { name: "A", lat: 1, lng: 2, description: "メモ" },
    ]);
    expect(withDesc).toContain("<description>メモ</description>");

    const noDesc = buildPlacesKml("t", [{ name: "A", lat: 1, lng: 2 }]);
    expect(noDesc).not.toContain("<description>");

    const blank = buildPlacesKml("t", [
      { name: "A", lat: 1, lng: 2, description: "   " },
    ]);
    expect(blank).not.toContain("<description>");
  });

  it("XML 特殊文字をエスケープする", () => {
    const out = buildPlacesKml("R&D <旅>", [
      { name: "A&B <c>", lat: 1, lng: 2, description: "x > y & z" },
    ]);
    expect(out).toContain("<name>A&amp;B &lt;c&gt;</name>");
    expect(out).toContain("<name>R&amp;D &lt;旅&gt;</name>");
    expect(out).toContain("<description>x &gt; y &amp; z</description>");
  });

  it("複数 placemark を並べる", () => {
    const marks: KmlPlacemark[] = [
      { name: "A", lat: 1, lng: 2 },
      { name: "B", lat: 3, lng: 4 },
    ];
    const out = buildPlacesKml("t", marks);
    expect((out.match(/<Placemark>/g) ?? []).length).toBe(2);
  });

  it("空配列でも妥当な KML を返す", () => {
    const out = buildPlacesKml("t", []);
    expect(out).toContain("<kml");
    expect(out).toContain("</kml>");
    expect(out).not.toContain("<Placemark>");
  });
});
