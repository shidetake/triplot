import { Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { getIconPath } from "@triplot/shared/placeIcons";
import { pastelBgColor, vividColor } from "@triplot/shared/memberColors";

import { useTheme } from "@/lib/theme";

// 保存済み場所のマーカー（web の place-map と同形＝色付き丸＋白縁＋白カテゴリ
// アイコン）。確定=green(#10b981)、未確定(tentative)=作成者のメンバー色
// （vivid）＋半透明。hue が無い未確定は中立グレー（ドット/マーカーのフォール
// バック規約）。ダーク地図では web と同じく「パステル面＋グレー縁＋濃色アイコン」
// に反転して地図に馴染ませる。
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
  const t = useTheme();
  const bg = t.dark
    ? pastelBgColor(tentative ? creatorHue : 140)
    : tentative
      ? (vividColor(creatorHue) ?? "#6b7280")
      : "#10b981";
  const border = t.dark ? "#6b7280" : "#fff";
  const glyph = t.dark ? "#202124" : "#fff";
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: border,
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
        <Path d={getIconPath(icon)} fill={glyph} />
      </Svg>
    </View>
  );
}

// 検索候補ピン（本家 Google マップの検索結果ピンと同形＝白ピル＋赤丸の
// カテゴリグリフ＋評価値＋下向きの尻尾）。ブランド色・白ピルはダークでも
// そのまま（本家と同じ。「地図・Google 連携のビジュアルは Google に合わせる」）。
// 選択中は本家同様に一回り拡大して示す。
//
// 寸法は candidatePinSize と同じ定数から決める（ラベル衝突計算・Marker の
// anchor 計算がこの箱の実寸に依存するため、実測でなく数値で確定させる）。
const CANDIDATE_PIN = {
  pillHeight: 30,
  circle: 26,
  glyph: 16,
  pad: 2,
  ratingGap: 3,
  ratingWidth: 25, // "4.6" ＝ 3文字 × fontSize 13 × 0.6 + 予備
  ratingPadRight: 8,
  fontSize: 13,
  tailWidth: 12,
  tailHeight: 5,
  selectedScale: 1.3,
};

// ピン箱（先端＝下端中央）の実寸。mapLabelLayout の LabelLayoutItem.pin と
// Marker コンテナの絶対配置の両方がこれを使う。
export function candidatePinSize(
  rating: number | null,
  selected: boolean,
): { width: number; height: number } {
  const c = CANDIDATE_PIN;
  const s = selected ? c.selectedScale : 1;
  const pillWidth =
    rating != null
      ? c.pad + c.circle + c.ratingGap + c.ratingWidth + c.ratingPadRight
      : c.pad + c.circle + c.pad;
  return {
    width: Math.round(pillWidth * s),
    height: Math.round((c.pillHeight + c.tailHeight) * s),
  };
}

export function CandidatePin({
  icon,
  rating,
  selected,
}: {
  icon: string;
  rating: number | null;
  selected: boolean;
}) {
  const c = CANDIDATE_PIN;
  const s = selected ? c.selectedScale : 1;
  const size = candidatePinSize(rating, selected);
  return (
    <View style={{ width: size.width, height: size.height, alignItems: "center" }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          height: c.pillHeight * s,
          borderRadius: (c.pillHeight / 2) * s,
          backgroundColor: "#fff",
          paddingLeft: c.pad * s,
          paddingRight: (rating != null ? c.ratingPadRight : c.pad) * s,
          gap: c.ratingGap * s,
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 2,
          shadowOffset: { width: 0, height: 1 },
          elevation: 2,
        }}
      >
        <View
          style={{
            width: c.circle * s,
            height: c.circle * s,
            borderRadius: (c.circle / 2) * s,
            backgroundColor: "#EA4335",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Svg
            viewBox="0 -960 960 960"
            width={c.glyph * s}
            height={c.glyph * s}
          >
            <Path d={getIconPath(icon)} fill="#fff" />
          </Svg>
        </View>
        {rating != null && (
          <Text
            style={{
              fontSize: c.fontSize * s,
              fontWeight: "500",
              color: "#202124",
            }}
          >
            {rating.toFixed(1)}
          </Text>
        )}
      </View>
      <Svg
        width={c.tailWidth * s}
        height={c.tailHeight * s}
        viewBox="0 0 12 5"
      >
        <Path d="M0 0h12L6 5Z" fill="#fff" />
      </Svg>
    </View>
  );
}

// ドラッグ仮ピン（web の RedPin と同じ Material location_on の雫、
// Google 純正マーカー色 赤 #EA4335・白縁・濃赤の内円）。ブランド色なので
// ダークでもそのまま。
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
