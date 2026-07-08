import Svg, { Path } from "react-native-svg";

import { getIconPath } from "@triplot/shared/placeIcons";

// 場所カテゴリのアイコン（RN 版・一覧の行頭に出す塗りグリフ）。
// パスは shared/placeIcons のカタログ（web の PlaceIcon と単一の真実）。
export function PlaceCategoryIcon({
  icon,
  size = 20,
  color = "#000",
}: {
  icon: string;
  size?: number;
  color?: string;
}) {
  return (
    <Svg viewBox="0 -960 960 960" width={size} height={size} fill={color}>
      <Path d={getIconPath(icon)} />
    </Svg>
  );
}
