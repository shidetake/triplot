import type { ReactNode } from "react";

import { NEUTRAL, roleColorFromHex } from "@triplot/shared/colorRoles";

import { ld } from "@/lib/themeColor";

// 色付きの丸ピル。費用カテゴリ・場所ステータスなど trip ごとの色付きラベルで
// 共用する。
//
// 渡された色からは**色相だけ**を使い、面と文字の明度・彩度は役割ラダー
// （colorRoles.ts）が決める。以前は渡された色をそのまま地にして白文字を
// 乗せていたが、それだと地色次第でコントラストが 2.15:1（カジノの amber）
// まで落ちて WCAG 1.4.3 を満たせなかった（既定12色中10色が未達）。
//
// CJK テキストの縦中央を全ブラウザで揃えるための調整（leading-none ＋
// テキストだけ 0.5px 下げ）をここに集約しているので、新しいバッジもこれを
// 使えば自動で揃う。icon を渡すとテキストの左に並ぶ。
export function ColorBadge({
  color,
  icon,
  children,
}: {
  color: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const bg = roleColorFromHex(color, "surface") ?? NEUTRAL.surface;
  const fg = roleColorFromHex(color, "onSurface") ?? NEUTRAL.onSurface;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium leading-none"
      style={{ backgroundColor: ld(bg), color: ld(fg) }}
    >
      {icon}
      {/* iOS Safari の CJK は行ボックス内でやや上目に出るため、テキストだけ実寸
          0.5px 下げて視覚的に中央へ寄せる（leading-none と併用・全ブラウザ一律）。 */}
      <span className="relative top-[0.5px]">{children}</span>
    </span>
  );
}

// アイコンだけの丸チップ（カテゴリ選択・カテゴリ管理の行頭）。ColorBadge と
// 同じ役割ラダーに乗せるので、地と glyph のコントラストは全色相で担保される。
export function ColorDisc({
  color,
  size,
  children,
}: {
  color: string;
  // 丸の直径（px）。中の SVG は inset で内側に余白を作るので同じ値を渡す。
  size: number;
  children: ReactNode;
}) {
  const bg = roleColorFromHex(color, "surface") ?? NEUTRAL.surface;
  const fg = roleColorFromHex(color, "onSurface") ?? NEUTRAL.onSurface;
  return (
    <span
      className="block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: ld(bg),
        color: ld(fg),
      }}
    >
      {children}
    </span>
  );
}
