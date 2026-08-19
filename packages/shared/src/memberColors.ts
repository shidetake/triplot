// メンバー色は**色相（hue）だけ**を整数で trip_members.color に保存する。
// preset は持たず、SQL 側 pick_member_color が「使用済み色相 + 確定色
// （GREEN_HUE）からの角度距離が最大」を毎回計算して割り当てる。
//
// **角度は OKLCH の色相環**（旧 HSL）。円周上の等間隔＝見た目の等間隔に
// なるので、farthest-point の割り当てが狙いどおり「区別しやすい色」を
// 選ぶようになる（HSL は緑に広い弧を割き黄〜橙を圧縮するため、90° 離して
// も見た目の差が 2.85 倍ばらついていた）。
//
// 明度・彩度はここでは決めない。役割（面 / 面上の文字 / 単色）ごとの
// 明度・彩度は colorRoles.ts の1枚の表が持つ。
//
// 各関数は**ライトとダークの対**（ColorPair）を返す。テーマの解決は
// プラットフォーム側（web は CSS の light-dark()、RN は useColorScheme）。

import {
  NEUTRAL,
  roleColor,
  type ColorPair,
} from "./colorRoles";

export { normalizeHue, type ColorPair } from "./colorRoles";

// チップ用: 薄い面 + 濃い文字 + 同系統の輪郭。
export interface ChipColors {
  bg: ColorPair;
  fg: ColorPair;
  ring: ColorPair;
}

// hue が無効（NULL / 範囲外）なら null。呼び出し側は中立の見た目
// （primary 塗り等）にフォールバックする＝色が付かないので QA で気付ける。
export function chipColors(hue: number | null | undefined): ChipColors | null {
  const bg = roleColor(hue, "surface");
  const fg = roleColor(hue, "onSurface");
  const ring = roleColor(hue, "outline");
  if (!bg || !fg || !ring) return null;
  return { bg, fg, ring };
}

// アバター（イニシャル円）用: 輪郭なし、面 + 文字だけ。
export function avatarColors(
  hue: number | null | undefined,
): { bg: ColorPair; fg: ColorPair } | null {
  const c = chipColors(hue);
  return c ? { bg: c.bg, fg: c.fg } : null;
}

// ドット用: 単色で塗る小さな図形（参加者ドット等）。チップと違い hue が無効
// でも**必ず色を返す** —— 点が消えると「誰も居ない」に見えてしまうため、
// 中立グレーにフォールバックする。
export function dotColor(hue: number | null | undefined): ColorPair {
  return roleColor(hue, "solid") ?? NEUTRAL.solid;
}

// 地図マーカーの丸。ページではなく**地図の上**に乗るので、ダークでは淡い面 +
// 濃いグリフに反転して地図に馴染ませる（本家 Google マップのダーク配色に
// 合わせる。ui-guidelines「地図・Google 連携のビジュアルは Google に合わせる」）。
// 面の明度・彩度は同じラダーから取るので、色相による明るさのばらつきは無い。
//
// 未確定（tentative）は**同じ色相のまま一段明るい面**で表す。半透明にしないのは、
// RN の地図マーカーがビットマップ化されてピンが重なるたびに縁が黒ずむため
// （place-marker.tsx のコメント参照）。web も同じ見た目に揃える。
export function pinColors(
  hue: number | null | undefined,
  tentative: boolean,
): {
  bg: ColorPair;
  glyph: ColorPair;
  border: ColorPair;
} {
  const solid = roleColor(hue, "solid") ?? NEUTRAL.solid;
  // 淡い面は onSurface（L=.90 のパステル）を流用する。
  const pastel = roleColor(hue, "onSurface") ?? NEUTRAL.onSurface;
  const lightBg = tentative ? pastel.light : solid.light;
  return {
    bg: { light: lightBg, dark: pastel.dark },
    // 淡い面の上は濃いグリフ、濃い面の上は白グリフ。
    glyph: { light: tentative ? "#202124" : "#ffffff", dark: "#202124" },
    border: { light: "#ffffff", dark: "#6b7280" },
  };
}

// 表示名から「省略形」を1文字取り出す。Spread でコードポイント単位に分割するので、
// 絵文字 / サロゲートペアでも 1文字として正しく扱える（日本語は元から1コードポイント）。
export function firstChar(name: string | null | undefined): string {
  if (!name) return "?";
  return [...name.trim()][0] ?? "?";
}
