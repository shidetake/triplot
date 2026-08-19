// 色を持つ面の「役割 × テーマ」を1枚の表で決める層。
//
// ■ 何を守りたいか
//   1. 読めること。WCAG 2.2 の下限（本文 4.5:1 / 図形・UI 部品 3:1）を、
//      どの色相でも満たす。
//   2. 眩しくないこと。ダークで大きな面がページ地より極端に明るくならない。
//      WCAG に上限の規定は無いので、Material Design 3 のダークスキーム
//      （コンテナがページ地に対しおよそ 1.5〜3.5:1）を根拠に **3:1 以下**を
//      自分たちのルールとして置く。
//   3. 色ごとに手で調整しないこと。ユーザーや DB が持つのは**色相だけ**で、
//      明度・彩度はこの表が決める。
//
// ■ なぜ HSL をやめて OKLCH なのか
//   HSL の L は知覚的な明るさではない。`hsl(h, 70%, 50%)` は黄(50°)で
//   白に対し 1.9:1、青(230°)で 7.2:1 と、同じ指定なのに色相で 3.8 倍ぶれる
//   ＝どの色相でも同じ読みやすさ、が原理的に作れない。OKLCH の L は
//   知覚的な明度なので、L を固定すればコントラストがほぼ色相非依存になる
//   （実測で 1.23〜1.30:1 に収まる。colorRoles.test.ts が全 360 色相で検証）。
//
// ■ 使い方
//   `roleColor(hue, "surface")` は **ライトとダークの対**を返す。テーマの
//   解決は各プラットフォームがやる（web は CSS の `light-dark()`、RN は
//   `useColorScheme`）。web はテーマを `<html class="dark">` で切り替えるので、
//   描画時に JS でテーマを知ろうとするとサーバー描画とズレる — だから
//   共有層は対を返すところまでで止める。

export type ColorRole =
  // 色付きの面（メンバーチップ・予定ブロック・費用カテゴリバッジの地）
  | "surface"
  // 同上の hover 時
  | "surfaceHover"
  // 面の上に乗る文字・アイコン
  | "onSurface"
  // 面の輪郭・選択強調の枠（面に対して 3:1 以上）
  | "outline"
  // 単色で塗る小さな図形（参加者ドット・地図マーカー）。ページ地／地図に
  // 対して 3:1 以上
  | "solid";

export interface ColorPair {
  light: string;
  dark: string;
}

interface Tone {
  l: number;
  c: number;
}

// 役割 × テーマ → OKLCH の (L, C)。**ここがこのアプリの色の単一の真実**。
// 明るさを変えたいときは色ごとの呼び出し側ではなくこの表を触る。
const LADDER: Record<ColorRole, { light: Tone; dark: Tone }> = {
  surface: { light: { l: 0.92, c: 0.07 }, dark: { l: 0.32, c: 0.06 } },
  surfaceHover: { light: { l: 0.87, c: 0.08 }, dark: { l: 0.38, c: 0.07 } },
  onSurface: { light: { l: 0.4, c: 0.09 }, dark: { l: 0.9, c: 0.07 } },
  outline: { light: { l: 0.59, c: 0.14 }, dark: { l: 0.62, c: 0.12 } },
  solid: { light: { l: 0.62, c: 0.14 }, dark: { l: 0.72, c: 0.13 } },
};

// 有効な色相か（DB の色相は 0-359 の整数）。範囲外・NULL は呼び出し側が
// 中立色にフォールバックする。
export function normalizeHue(h: number | null | undefined): number | null {
  if (h == null || typeof h !== "number" || !Number.isFinite(h)) return null;
  const n = Math.round(h);
  return n < 0 || n >= 360 ? null : n;
}

export function roleColor(
  hue: number | null | undefined,
  role: ColorRole,
): ColorPair | null {
  const h = normalizeHue(hue);
  if (h == null) return null;
  const tone = LADDER[role];
  return {
    light: oklchToHex(tone.light.l, tone.light.c, h),
    dark: oklchToHex(tone.dark.l, tone.dark.c, h),
  };
}

// hex で色を持っているもの（費用カテゴリ。ユーザーが色相ホイールで選ぶ）用。
// 色相だけ取り出して、明度・彩度は上の表で決め直す＝どの色を選んでも読める。
// 無彩色や不正値なら null（呼び出し側が NEUTRAL にフォールバック）。
export function roleColorFromHex(
  hex: string | null | undefined,
  role: ColorRole,
): ColorPair | null {
  return roleColor(hueOfHex(hex), role);
}

// 既存の hex（費用カテゴリの色。ユーザーが色相ホイールで選ぶ）から色相を
// 取り出す。彩度・明度は捨てて上の表で決め直す＝どの色を選んでも読める。
export function hueOfHex(hex: string | null | undefined): number | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  const [l, a, b] = srgbToOklab(
    (v >> 16) & 0xff,
    (v >> 8) & 0xff,
    v & 0xff,
  );
  // 無彩色（グレー）は色相を持たない。
  if (Math.hypot(a, b) < 0.002) return null;
  void l;
  const deg = (Math.atan2(b, a) * 180) / Math.PI;
  return Math.round((deg + 360) % 360) % 360;
}

// ─────────────────────────────────────────────────────────
// OKLCH → sRGB（Björn Ottosson の Oklab）。ブラウザの `oklch()` に頼らず
// 自前で持つのは、RN が同じ値を必要とするため（web だけ CSS 任せにすると
// 2つの実装がズレる）。
// ─────────────────────────────────────────────────────────

function oklabToLinearSrgb(L: number, a: number, b: number): number[] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function srgbToOklab(r8: number, g8: number, b8: number): number[] {
  const lin = (c: number) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const r = lin(r8);
  const g = lin(g8);
  const b = lin(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function inGamut(L: number, C: number, hDeg: number): boolean {
  const rad = (hDeg * Math.PI) / 180;
  const rgb = oklabToLinearSrgb(L, C * Math.cos(rad), C * Math.sin(rad));
  return rgb.every((c) => c >= -0.0005 && c <= 1.0005);
}

// sRGB からはみ出す (L, C) は、CSS の `oklch()` と同じく **L を保ったまま
// 彩度だけ落として**収める。明度が動かないのでコントラストが保たれる。
function oklchToHex(L: number, C: number, hDeg: number): string {
  let c = C;
  if (!inGamut(L, c, hDeg)) {
    let lo = 0;
    let hi = c;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(L, mid, hDeg)) lo = mid;
      else hi = mid;
    }
    c = lo;
  }
  const rad = (hDeg * Math.PI) / 180;
  const rgb = oklabToLinearSrgb(L, c * Math.cos(rad), c * Math.sin(rad));
  const hex = rgb
    .map((v) => {
      const x = Math.max(0, Math.min(1, v));
      const s = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
      return Math.round(s * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("");
  return `#${hex}`;
}

// ─────────────────────────────────────────────────────────
// コントラスト比（WCAG 2.2）。テストと、必要なら実装からも使う。
// ─────────────────────────────────────────────────────────

export function relativeLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`bad hex: ${hex}`);
  const v = parseInt(m[1], 16);
  const ch = [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff].map((c) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ページ地（globals.css の --background / RN の theme.bg と同値）。
// テストが「面がページ地に対して明るすぎないか」を測るのに使う。
export const PAGE_BG: ColorPair = { light: "#ffffff", dark: "#0a0a0a" };

// 色相を持たないとき（メンバー色未割当・グレーのカテゴリ色）のフォールバック。
// 面が消えて何も見えなくなるより中立グレーで出す方がよい箇所で使う。
export const NEUTRAL: Record<ColorRole, ColorPair> = {
  surface: { light: "#e8e8e8", dark: "#333333" },
  surfaceHover: { light: "#dcdcdc", dark: "#3d3d3d" },
  onSurface: { light: "#4b4b4b", dark: "#e0e0e0" },
  outline: { light: "#8f8f8f", dark: "#8f8f8f" },
  solid: { light: "#8f8f8f", dark: "#adadad" },
};
