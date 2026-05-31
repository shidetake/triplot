// 場所一覧 → KML を生成する純粋関数。Google マイマップ等にインポートして
// 旅行の地図を作るためのエクスポート。
//
// 色・アイコンも標準 KML の範囲で載せる:
//  - <Style>/<IconStyle> に色（ABGR）とアイコン画像 href を持たせる
//  - 各 Placemark は <styleUrl> でスタイルを参照
//  - カテゴリ（status 名）は <ExtendedData> のデータ列としても出す
//    （マイマップは取り込み後に「列でスタイル分け」できる）
// Google Earth / QGIS は色・アイコンを忠実に描画。マイマップはアイコン画像を
// 内蔵アイコンに差し替えるが、エラーにはならず色やデータ列は活きる。

export type KmlPlacemark = {
  name: string;
  lat: number;
  lng: number;
  description?: string | null;
  // 参照するスタイル ID（buildPlacesKml の styles と対応）。
  styleId?: string | null;
  // 取り込み後の色分け用データ列（status 名など）。
  category?: string | null;
  // 以下はクライアントのピン画像生成用（KML 出力では使わないが、
  // page → trip-actions で運ぶため型に持たせる）。
  iconKey?: string | null;
  colorHex?: string | null;
};

export type KmlStyle = {
  id: string;
  // KML の <color>。ABGR 順（aabbggrr）の16進文字列。
  color: string;
  // アイコン画像への参照（KMZ 内の相対パス "files/xxx.png" 等）。
  // 省略時は <Icon> を出さず、地図の既定マーカー（色だけ反映）になる。
  iconHref?: string;
};

// XML 特殊文字をエスケープ。座標やテキストにユーザ入力が入るため必須。
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildPlacesKml(
  documentName: string,
  placemarks: KmlPlacemark[],
  styles: KmlStyle[] = [],
): string {
  const styleBlocks = styles
    .map((s) =>
      [
        `    <Style id="${escapeXml(s.id)}">`,
        "      <IconStyle>",
        `        <color>${escapeXml(s.color)}</color>`,
        // 画像 href があるときだけ <Icon> を出す。無ければ既定マーカーを色付けする。
        s.iconHref
          ? [
              "        <Icon>",
              `          <href>${escapeXml(s.iconHref)}</href>`,
              "        </Icon>",
            ].join("\n")
          : null,
        "      </IconStyle>",
        "    </Style>",
      ]
        .filter((l) => l !== null)
        .join("\n"),
    )
    .join("\n");

  const body = placemarks
    .map((p) => {
      const desc = p.description?.trim();
      const cat = p.category?.trim();
      return [
        "    <Placemark>",
        `      <name>${escapeXml(p.name)}</name>`,
        desc ? `      <description>${escapeXml(desc)}</description>` : null,
        p.styleId ? `      <styleUrl>#${escapeXml(p.styleId)}</styleUrl>` : null,
        cat
          ? [
              "      <ExtendedData>",
              '        <Data name="category">',
              `          <value>${escapeXml(cat)}</value>`,
              "        </Data>",
              "      </ExtendedData>",
            ].join("\n")
          : null,
        "      <Point>",
        `        <coordinates>${p.lng},${p.lat},0</coordinates>`,
        "      </Point>",
        "    </Placemark>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    "  <Document>",
    `    <name>${escapeXml(documentName)}</name>`,
    styleBlocks || null,
    body,
    "  </Document>",
    "</kml>",
  ]
    .filter((l) => l !== null)
    .join("\n");
}
