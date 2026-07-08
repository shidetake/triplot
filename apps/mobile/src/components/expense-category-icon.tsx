import Svg, { Path } from "react-native-svg";

import { expenseIconPath } from "@triplot/shared/expenseIcons";

// 費用カテゴリのアイコン（RN 版）。パスカタログは shared/expenseIcons.ts
// （web と単一の真実）。viewBox の inset 仕組みも web と同じ。
export function ExpenseCategoryIcon({
  icon,
  size = 18,
  inset = 0,
  color = "#000",
}: {
  icon: string;
  size?: number;
  inset?: number;
  color?: string;
}) {
  const span = 960 / (1 - 2 * inset);
  const off = (span - 960) / 2;
  return (
    <Svg
      viewBox={`${-off} ${-960 - off} ${span} ${span}`}
      width={size}
      height={size}
      fill={color}
    >
      <Path d={expenseIconPath(icon)} />
    </Svg>
  );
}
