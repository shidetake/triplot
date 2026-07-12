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

// 検索候補ピン（本家 Google マップの検索結果ピンと同形＝ピル＋丸のカテゴリ
// グリフ＋評価値＋下向きの尻尾）。選択中は本家と同じく大きさを変えず配色を
// 反転して示す（ピル地が赤になり、丸が白抜きになる）。ダークの配色は本家
// ダークのスクリーンショット実測値、ライトは同じ反転則をライト配色に写した
// もの（「地図・Google 連携のビジュアルは Google に合わせる」）。
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
};

// 配色（pill 地 / circle 丸 / glyph 丸中のグリフ / text 評価値）。
const CANDIDATE_COLORS = {
  light: {
    normal: { pill: "#fff", circle: "#EA4335", glyph: "#fff", text: "#202124" },
    selected: { pill: "#EA4335", circle: "#fff", glyph: "#EA4335", text: "#fff" },
  },
  dark: {
    normal: { pill: "#5A616F", circle: "#DD6E62", glyph: "#202124", text: "#fff" },
    selected: { pill: "#DD6E62", circle: "#fff", glyph: "#DD6E62", text: "#fff" },
  },
};

// ピン箱（先端＝下端中央）の実寸。mapLabelLayout の LabelLayoutItem.pin と
// Marker コンテナの絶対配置の両方がこれを使う（実測でなく数値で確定させる）。
// 選択で大きさは変わらない。
export function candidatePinSize(rating: number | null): {
  width: number;
  height: number;
} {
  const c = CANDIDATE_PIN;
  const pillWidth =
    rating != null
      ? c.pad + c.circle + c.ratingGap + c.ratingWidth + c.ratingPadRight
      : c.pad + c.circle + c.pad;
  return { width: pillWidth, height: c.pillHeight + c.tailHeight };
}

export function CandidatePin({
  icon,
  rating,
  selected,
  dark,
}: {
  icon: string;
  rating: number | null;
  selected: boolean;
  dark: boolean;
}) {
  const c = CANDIDATE_PIN;
  const col = CANDIDATE_COLORS[dark ? "dark" : "light"][
    selected ? "selected" : "normal"
  ];
  const size = candidatePinSize(rating);
  return (
    <View style={{ width: size.width, height: size.height, alignItems: "center" }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          height: c.pillHeight,
          borderRadius: c.pillHeight / 2,
          backgroundColor: col.pill,
          paddingLeft: c.pad,
          paddingRight: rating != null ? c.ratingPadRight : c.pad,
          gap: c.ratingGap,
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 2,
          shadowOffset: { width: 0, height: 1 },
          elevation: 2,
        }}
      >
        <View
          style={{
            width: c.circle,
            height: c.circle,
            borderRadius: c.circle / 2,
            backgroundColor: col.circle,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Svg viewBox="0 -960 960 960" width={c.glyph} height={c.glyph}>
            <Path d={getIconPath(icon)} fill={col.glyph} />
          </Svg>
        </View>
        {rating != null && (
          <Text
            style={{
              fontSize: c.fontSize,
              fontWeight: "500",
              color: col.text,
            }}
          >
            {rating.toFixed(1)}
          </Text>
        )}
      </View>
      <Svg width={c.tailWidth} height={c.tailHeight} viewBox="0 0 12 5">
        <Path d="M0 0h12L6 5Z" fill={col.pill} />
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
