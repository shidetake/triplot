import { Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { getIconPath } from "@triplot/shared/placeIcons";
import { pinColors } from "@triplot/shared/memberColors";
import { GREEN_HUE } from "@triplot/shared/eventColor";

import { useTheme } from "@/lib/theme";

// 保存済み場所のマーカー（web の place-map と同形＝色付き丸＋白縁＋白カテゴリ
// アイコン）。確定=予約色(GREEN_HUE)、未確定(tentative)=作成者のメンバー色。
// 配色は pinColors（役割ラダー）から取るので色相による明るさのばらつきが無い。
// ダーク地図では web と同じく「パステル面＋グレー縁＋濃色アイコン」に反転して
// 地図に馴染ませる。web は未確定を opacity-50 で薄く見せるが、RN は下の
// コメントの理由で opacity を使わず、最初から明るい不透明色で表す。
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
  const m = t.dark ? "dark" : "light";
  const pin = pinColors(tentative ? creatorHue : GREEN_HUE, tentative);
  const bg = pin.bg[m];
  const border = pin.border[m];
  const glyph = pin.glyph[m];
  return (
    // 影を付けない・opacity で薄めない: react-native-maps は Marker を
    // 画像化（ビットマップ化）して地図に置くため、CSS の box-shadow や
    // opacity と違って「重なった分だけ正しく合成される」仕組みが効かない。
    // 影はどれだけ円の形に合わせても外側にわずかにはみ出し（実機
    // フィードバック）、opacity は縁のアンチエイリアス部分がこのビットマップ化
    // の過程で二重に減光合成されて縁が黒ずむ（react-native-maps の既知の
    // 半透明ビュー合成バグ）。どちらも1個では気付かない程度でも、ピンが
    // 密集すると重なった分だけ積み重なって黒ずんで見える。影は無くし、
    // 未確定の「薄い」見た目は opacity ではなく最初から明るい不透明色
    // （tentativeFillColor）で表す＝合成バグ自体を起こさせない。
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
        overflow: "hidden",
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

// 現在地の青丸（本家 Google マップと同じ配色: Google Blue #4285F4＋白縁＋薄い
// 精度円）。showsUserLocation の native 描画は Google SDK 内部のレイヤーが
// 独自の重なり順を持ち、確定ピンの zIndex を上げても後ろに隠れたままだった
// （実機検証済み）ため、自前の Marker として描いて重なり順を制御する
// （places.tsx 参照）。
export function MyLocationDot({ size = 18 }: { size?: number }) {
  const halo = size * 2.4;
  return (
    <View
      style={{
        width: halo,
        height: halo,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          position: "absolute",
          width: halo,
          height: halo,
          borderRadius: halo / 2,
          backgroundColor: "rgba(66,133,244,0.25)",
        }}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "#4285F4",
          borderWidth: 2,
          borderColor: "#ffffff",
          shadowColor: "#000",
          shadowOpacity: 0.3,
          shadowRadius: 2,
          shadowOffset: { width: 0, height: 1 },
          elevation: 3,
        }}
      />
    </View>
  );
}
