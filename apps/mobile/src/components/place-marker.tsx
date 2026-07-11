import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { getIconPath } from "@triplot/shared/placeIcons";
import { vividColor } from "@triplot/shared/memberColors";

// 保存済み場所のマーカー（web の place-map と同形＝色付き丸＋白縁＋白カテゴリ
// アイコン）。確定=green(#10b981)、未確定(tentative)=作成者のメンバー色
// （vivid）＋半透明。hue が無い未確定は中立グレー（ドット/マーカーのフォール
// バック規約）。
export function PlaceMarker({
  icon,
  tentative,
  creatorHue,
  size = 28,
}: {
  icon: string;
  tentative: boolean;
  creatorHue: number | null;
  size?: number;
}) {
  const bg = tentative ? (vividColor(creatorHue) ?? "#6b7280") : "#10b981";
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: "#fff",
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
        opacity: tentative ? 0.5 : 1,
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
        elevation: 2,
      }}
    >
      <Svg viewBox="0 -960 960 960" width={16} height={16}>
        <Path d={getIconPath(icon)} fill="#fff" />
      </Svg>
    </View>
  );
}

// 検索候補・ドラッグ仮ピン（web の RedPin と同じ Material location_on の雫、
// Google 純正マーカー色 赤 #EA4335・白縁・濃赤の内円）。
export function RedPin({ size = 34 }: { size?: number }) {
  return (
    <Svg viewBox="0 -960 960 960" width={size} height={size}>
      <Path
        d="M458.5-103.5Q448-107 440-115q-42-38-91-87.5T258-309q-42-57-70-119t-28-124q0-150 96.5-239T480-880q127 0 223.5 89T800-552q0 62-28 124t-70 119q-42 57-91 106.5T520-115q-8 8-18.5 11.5T480-100q-11 0-21.5-3.5Z"
        fill="#EA4335"
        stroke="#ffffff"
        strokeWidth={22}
      />
      <Circle cx={480} cy={-560} r={92} fill="#A50E0E" />
    </Svg>
  );
}
