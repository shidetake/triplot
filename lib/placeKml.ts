// 場所 → Google マイマップ取り込み用の KML を生成する純粋関数。
// マイマップは KML/CSV をインポートできるが「書き込み API」は無いので、
// このファイルを生成 → ユーザが手動で My Maps に import する運用になる。
// 座標を持つ place だけが対象（未マップの自由入力 place は地図に置けない）。

export type KmlPlacemark = {
  name: string;
  lat: number;
  lng: number;
  description?: string | null;
};

// KML はテキスト要素に & < > が混ざると壊れるのでエスケープ。属性には書かない
// ので " ' は対象外。
function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildPlacesKml(
  documentName: string,
  placemarks: KmlPlacemark[],
): string {
  const marks = placemarks
    .map((p) => {
      const desc = p.description?.trim();
      const descEl = desc
        ? `\n      <description>${escapeXml(desc)}</description>`
        : "";
      // coordinates は KML 仕様で経度,緯度[,高度] の順（lat,lng ではない）。
      return `    <Placemark>
      <name>${escapeXml(p.name)}</name>${descEl}
      <Point><coordinates>${p.lng},${p.lat},0</coordinates></Point>
    </Placemark>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(documentName)}</name>
${marks}
  </Document>
</kml>
`;
}
