// メンバー色は色相 (hue, 0-359) を整数で trip_members.color に保存する。
// preset は持たず、SQL 側 pick_member_color が「使用済み色相 + 確定 green(140°)
// からの距離最大」を毎回計算して割り当てる。
//
// 描画はインラインの hsl(h, s%, l%) 値で行う。Tailwind の color class とは
// 完全に独立。
//
// ダークモード対応時は値関数の中で背景/文字の lightness を反転するだけで OK。

import type { CSSProperties } from "react";

// 念のため有効範囲を絞る関数。NULL や範囲外は描画側で空 style にして
// QA で気付けるようにする（zinc 等の fallback はしない方針）。
function normalizeHue(h: number | null | undefined): number | null {
  if (h == null) return null;
  if (typeof h !== "number" || !Number.isFinite(h)) return null;
  const n = Math.round(h);
  if (n < 0 || n >= 360) return null;
  return n;
}

// チップ用: 薄い背景 + 濃い文字 + 同系統の薄いリング。
export function chipStyle(
  hue: number | null | undefined,
): CSSProperties {
  const h = normalizeHue(hue);
  if (h == null) return {};
  return {
    backgroundColor: `hsl(${h}, 90%, 92%)`,
    color: `hsl(${h}, 50%, 25%)`,
    // ring 相当を box-shadow inset で表現（Tailwind の ring と同じ見た目）。
    boxShadow: `inset 0 0 0 1px hsl(${h}, 80%, 82%)`,
  };
}

// アバター（イニシャル円）用: ring 無し、bg + text のみ。
export function avatarStyle(
  hue: number | null | undefined,
): CSSProperties {
  const h = normalizeHue(hue);
  if (h == null) return {};
  return {
    backgroundColor: `hsl(${h}, 90%, 92%)`,
    color: `hsl(${h}, 50%, 25%)`,
  };
}

// ドット/マーカー用: 濃いベタ塗りの単色（チップの薄い面とは別トーン）。地図の仮ピン・
// カレンダーの参加者ドットなど「小さな点で人を示す」所。hue が無効なら null を返す
// ＝チップ/アバターと違い空 style にはできない（点が消える）ので、呼び出し側が文脈に
// 応じた中立グレーをフォールバックに当てる。
export function vividColor(hue: number | null | undefined): string | null {
  const h = normalizeHue(hue);
  return h == null ? null : `hsl(${h}, 70%, 50%)`;
}

// 地図ピンのダークモード用パステル背景色。同じ hue から彩度・明度を変えるだけ。
// 黒アイコンが読めるよう明度を高く（80%）、彩度を抑えて（50%）柔らかくする。
// null 時は確定色(140°)のパステルを返す（vividColor と異なり地図ピン専用なので
// フォールバックを内包する）。
export function pastelBgColor(hue: number | null | undefined): string {
  const h = normalizeHue(hue) ?? 140;
  return `hsl(${h}, 50%, 80%)`;
}

// 表示名から「省略形」を1文字取り出す。Spread でコードポイント単位に分割するので、
// 絵文字 / サロゲートペアでも 1文字として正しく扱える（日本語は元から1コードポイント）。
export function firstChar(name: string | null | undefined): string {
  if (!name) return "?";
  return [...name.trim()][0] ?? "?";
}
