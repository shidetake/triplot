// 費用カテゴリのアイコン。場所カテゴリ(PlaceIcon)と同じく Material Symbols
// の塗りパスを inline で埋める（viewBox "0 -960 960 960"・依存ゼロ）。
// 操作系UIは Lucide(icons.tsx)、カテゴリ系は MS、と役割でファミリーを分けている。
// パスカタログは shared/expenseIcons.ts（RN と共用の単一の真実）。

import { expenseIconPath } from "@triplot/shared/expenseIcons";

export function ExpenseCategoryIcon({
  icon,
  size = 18,
  inset = 0,
  className,
}: {
  icon: string;
  size?: number;
  // 0..0.5。>0 にすると viewBox を広げて内側に余白を作る。これで svg を親(丸チップ)
  // いっぱいの size で描いても glyph は (1-2*inset) の大きさで中央に来る。
  // 「13px を 20px 丸に CSS flex で中央寄せ」だと余白が半端px(3.5)になり、エンジン/
  // DPR ごとに丸めが変わってズレる（WebKit≠Blink を実測）。SVG 内部描画は両エンジン
  // 完全一致なので、中央寄せを CSS でなく SVG 側でやるための仕組み。
  inset?: number;
  className?: string;
}) {
  const span = 960 / (1 - 2 * inset);
  const off = (span - 960) / 2;
  return (
    <svg
      viewBox={`${-off} ${-960 - off} ${span} ${span}`}
      width={size}
      height={size}
      fill="currentColor"
      className={["block", className].filter(Boolean).join(" ")}
      aria-hidden
    >
      <path d={expenseIconPath(icon)} />
    </svg>
  );
}
