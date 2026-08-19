import type { CSSProperties } from "react";

import {
  avatarColors,
  chipColors,
  dotColor,
  type ColorPair,
} from "@triplot/shared/memberColors";

// 共有層（colorRoles.ts）が返す「ライト/ダークの対」を web の CSS に落とす層。
//
// テーマは `<html class="dark">` で切り替えるので、インライン style の色を
// 描画時に JS で選ぶとサーバー描画とズレる（ちらつき・hydration 不一致）。
// CSS の `light-dark()` は `color-scheme`（globals.css が :root と .dark で
// 出し分け済み）を見て**ブラウザ側で**解決するので、サーバー描画のままで
// 両テーマに追従する。
export function ld(pair: ColorPair): string {
  return `light-dark(${pair.light}, ${pair.dark})`;
}

// メンバーチップ（薄い面 + 濃い文字 + 同系統の輪郭）。
// hue が無効なら空 style を返す＝呼び出し側が中立の見た目にフォールバックする。
export function chipStyle(hue: number | null | undefined): CSSProperties {
  const c = chipColors(hue);
  if (!c) return {};
  return {
    backgroundColor: ld(c.bg),
    color: ld(c.fg),
    // ring 相当を box-shadow inset で表現（Tailwind の ring と同じ見た目）。
    boxShadow: `inset 0 0 0 1px ${ld(c.ring)}`,
  };
}

// アバター（イニシャル円）。輪郭なし。
export function avatarStyle(hue: number | null | undefined): CSSProperties {
  const c = avatarColors(hue);
  if (!c) return {};
  return { backgroundColor: ld(c.bg), color: ld(c.fg) };
}

// 参加者ドットなど「単色の小さな図形」。hue が無効でも中立グレーを返す。
export function dotStyle(hue: number | null | undefined): CSSProperties {
  return { backgroundColor: ld(dotColor(hue)) };
}
