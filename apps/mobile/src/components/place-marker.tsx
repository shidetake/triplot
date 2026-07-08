import Svg, { Circle, Path } from "react-native-svg";

import { getIconPath } from "@triplot/shared/placeIcons";

// 保存済み場所のマーカー（Google マップ純正の location_on 形＋中の白丸に
// カテゴリアイコン）。確定=green、未確定(tentative)=amber
// （ui-guidelines.md「地図はGoogleに合わせる／未確定=amber」）。
// react-native-maps の Marker の子として置く。
export function PlaceMarker({
  icon,
  tentative,
  size = 40,
}: {
  icon: string;
  tentative: boolean;
  size?: number;
}) {
  const fill = tentative ? "#f59e0b" : "#10b981";
  // location_on の外形（viewBox 0 -960 960 960）。中央に白丸、その中にアイコン。
  return (
    <Svg viewBox="0 -960 960 960" width={size} height={size}>
      {/* ピン外形 */}
      <Path
        d="M480-480q33 0 56.5-23.5T560-560q0-33-23.5-56.5T480-640q-33 0-56.5 23.5T400-560q0 33 23.5 56.5T480-480ZM480-80Q319-217 239.5-334.5T160-552q0-150 96.5-239T480-880q127 0 223.5 89T800-552q0 100-79.5 217.5T480-80Z"
        fill={fill}
        stroke="#fff"
        strokeWidth={24}
      />
      {/* 白丸 */}
      <Circle cx={480} cy={-560} r={130} fill="#fff" />
      {/* カテゴリアイコン（白丸内・少し小さめ） */}
      <Path
        d={getIconPath(icon)}
        fill={fill}
        transform="translate(480 -560) scale(0.36) translate(-480 480)"
      />
    </Svg>
  );
}

// 検索候補・ドラッグ仮ピン（Google 純正マーカー色 赤 #EA4335・白縁）。
export function RedPin({ size = 40 }: { size?: number }) {
  return (
    <Svg viewBox="0 -960 960 960" width={size} height={size}>
      <Path
        d="M480-480q33 0 56.5-23.5T560-560q0-33-23.5-56.5T480-640q-33 0-56.5 23.5T400-560q0 33 23.5 56.5T480-480ZM480-80Q319-217 239.5-334.5T160-552q0-150 96.5-239T480-880q127 0 223.5 89T800-552q0 100-79.5 217.5T480-80Z"
        fill="#EA4335"
        stroke="#fff"
        strokeWidth={24}
      />
      <Circle cx={480} cy={-560} r={90} fill="#fff" />
    </Svg>
  );
}
