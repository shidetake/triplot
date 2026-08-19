import {
  avatarColors,
  chipColors,
  dotColor,
} from "@triplot/shared/memberColors";
import { NEUTRAL, roleColorFromHex } from "@triplot/shared/colorRoles";

// 共有層（colorRoles.ts）が返す「ライト/ダークの対」を RN のスタイルに落とす層。
// web の apps/web/lib/themeColor.ts と対で、関数名を揃えてある。
// web は CSS の light-dark() がブラウザ側で解決するのに対し、RN は
// useColorScheme() で得た dark を引数で渡して選ぶ（`useTheme().dark`）。

// メンバーチップ（薄い面 + 濃い文字 + 同系統の輪郭）。
// hue が無効なら null＝呼び出し側が中立の見た目にフォールバックする。
export function chipStyle(
  hue: number | null | undefined,
  dark: boolean,
): { backgroundColor: string; color: string; borderColor: string } | null {
  const c = chipColors(hue);
  if (!c) return null;
  const m = dark ? "dark" : "light";
  return {
    backgroundColor: c.bg[m],
    color: c.fg[m],
    borderColor: c.ring[m],
  };
}

// アバター（イニシャル円）。輪郭なし。
export function avatarStyle(
  hue: number | null | undefined,
  dark: boolean,
): { backgroundColor: string; color: string } | null {
  const c = avatarColors(hue);
  if (!c) return null;
  const m = dark ? "dark" : "light";
  return { backgroundColor: c.bg[m], color: c.fg[m] };
}

// 参加者ドットなど「単色の小さな図形」。hue が無効でも中立グレーを返す。
export function dotStyle(
  hue: number | null | undefined,
  dark: boolean,
): { backgroundColor: string } {
  return { backgroundColor: dotColor(hue)[dark ? "dark" : "light"] };
}

// 費用カテゴリの色付きピル／丸チップ（web の ColorBadge / ColorDisc と同形）。
// 渡された hex からは色相だけを使い、明度・彩度は役割ラダーが決める。
export function badgeStyle(
  hex: string | null | undefined,
  dark: boolean,
): { backgroundColor: string; color: string } {
  const m = dark ? "dark" : "light";
  const bg = roleColorFromHex(hex, "surface") ?? NEUTRAL.surface;
  const fg = roleColorFromHex(hex, "onSurface") ?? NEUTRAL.onSurface;
  return { backgroundColor: bg[m], color: fg[m] };
}
