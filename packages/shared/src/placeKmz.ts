// KMZ（KML＋ピン画像を1つの zip にまとめた地図エクスポート）の組み立て。
// (アイコン × 色) の組み合わせごとに1スタイルへ畳み、各 placemark に
// スタイル ID を振る。画像そのものの生成はプラットフォーム依存
// （web=canvas、RN=react-native-svg の toDataURL）なので、ここでは
// 「どの画像が要るか」までを決めて呼び出し側に渡す。

import type { KmlPlacemark, KmlStyle } from "./placeKml";
import { hexToKmlColor } from "./placeColor";

// 「その他」の汎用ピンはグリフを描かず、地図既定のマーカーに色だけ載せる
// （画像化しない）。
export const PLAIN_PIN_ICON = "pin";

export type KmzStyleNeed = {
  styleId: string;
  iconKey: string;
  colorHex: string | null;
  // 画像を作る必要があるか（汎用ピンは false＝既定マーカー＋色で済む）。
  needsImage: boolean;
  // 画像を作る場合に KML から参照する zip 内のパス。
  href: string;
};

export type KmzPlan = {
  // スタイル ID を割り当て済みの placemark。
  marks: KmlPlacemark[];
  // KML の <Style> 定義（画像を同梱しないものは iconHref なし）。
  styles: KmlStyle[];
  // 呼び出し側が画像を用意すべきスタイル（needsImage=true のみ）。
  needs: KmzStyleNeed[];
};

// placemark 群 → スタイル ID の割り当て・<Style> 定義・必要な画像の一覧。
export function planKmz(placemarks: KmlPlacemark[]): KmzPlan {
  const keyOf = (p: KmlPlacemark) =>
    `${p.iconKey ?? PLAIN_PIN_ICON}|${p.colorHex ?? "none"}`;

  const byKey = new Map<string, KmzStyleNeed>();
  for (const p of placemarks) {
    const k = keyOf(p);
    if (byKey.has(k)) continue;
    const styleId = `s${byKey.size}`;
    const iconKey = p.iconKey ?? PLAIN_PIN_ICON;
    byKey.set(k, {
      styleId,
      iconKey,
      colorHex: p.colorHex ?? null,
      needsImage: iconKey !== PLAIN_PIN_ICON,
      href: `files/${styleId}.png`,
    });
  }

  const marks: KmlPlacemark[] = placemarks.map((p) => ({
    ...p,
    styleId: byKey.get(keyOf(p))!.styleId,
  }));

  const styles: KmlStyle[] = [...byKey.values()].map((s) => ({
    id: s.styleId,
    color: hexToKmlColor(s.colorHex),
    // 汎用ピンは <Icon> 無し（既定マーカーを色付けする）。
    iconHref: s.needsImage ? s.href : undefined,
  }));

  return {
    marks,
    styles,
    needs: [...byKey.values()].filter((s) => s.needsImage),
  };
}
