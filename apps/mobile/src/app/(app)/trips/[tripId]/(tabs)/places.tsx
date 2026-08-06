import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  LayoutAnimation,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { GlassView } from "expo-glass-effect";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import Reanimated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenStack, ScreenStackItem } from "react-native-screens";
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  type Details,
  type Region,
} from "react-native-maps";
import { useTranslations } from "use-intl";

import {
  boundsOf,
  centerOf,
  clusterPlaces,
  dominantCenter,
  dominantCluster,
  labelByPlace,
  TOKYO,
} from "@triplot/shared/placeMap";
import {
  getIconLabel,
  iconKeyForGoogleType,
  type PinOption,
} from "@triplot/shared/placeIcons";
import {
  estimateLabelBox,
  layoutLabels,
  markerGeometry,
  type LabelPlacement,
} from "@triplot/shared/mapLabelLayout";
import { computeScaleBar } from "@triplot/shared/mapScale";
import {
  autocompletePlaces,
  fetchPlaceDetails,
  searchPlaces,
  type PlaceCandidate,
  type PlacePrediction,
} from "@triplot/shared/placesSearch";
import { setPlaceLocation } from "@triplot/shared/data/places";
import {
  earliestVisitByPlace,
  sortPlacesByItinerary,
  visitDayByPlace,
  type VisitDay,
} from "@triplot/shared/placeOrder";
import { buildTripTzTimeline, formatDayLabel } from "@triplot/shared/schedule";
import { fitAndHalfDetents } from "@triplot/shared/sheetDetents";
import {
  deriveOrderedExpenses,
  derivePlaces,
  deriveScheduleEvents,
  type PlaceRow,
} from "@triplot/shared/tripDerive";

import Svg, { Path } from "react-native-svg";

import { PlaceCategoryIcon } from "@/components/place-category-icon";
import { PlaceForm } from "@/components/place-form";
import {
  CandidatePin,
  candidatePinSize,
  MyLocationDot,
  PlaceMarker,
  RedPin,
} from "@/components/place-marker";
import {
  CheckIcon,
  ChevronIcon,
  FilterIcon,
  LockIcon,
  XIcon,
} from "@/components/icons";
import { SheetTitle } from "@/components/sheet-title";
import { BUNDLE_ID, PLACES_API_KEY } from "@/lib/googlePlaces";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
import { useInvalidateTrip, useTripDetail } from "@/lib/useTripDetail";
import { useTripId } from "@/lib/useTripId";

// Google 評価の★（web の place-popups と同じ Material Symbols star 塗り・amber）。
// 地図・Google 連携のビジュアルは Google に合わせる（ui-guidelines）。
const STAR_PATH =
  "m233-120 65-281L80-590l288-25 112-265 112 265 288 25-218 189 65 281-247-149-247 149Z";

// 「現在地に戻る」ボタンのグリフ（Material Symbols "navigation"）。本家
// Google マップ・iOS マップと同じく現在地を指している間だけ塗り、それ以外は
// アウトラインのみにする。地図・Google 連携のビジュアルは Google に合わせる
// （ui-guidelines）。
// アウトラインは Material Symbols のウェイト違いパス（fill0 バリアント）を
// 別に持たせず、塗りと同じこの1パスを stroke 描画するだけにする＝ウェイト
// 違いのパスはシルエット自体のサイズ/比率が変わり、塗り⇄アウトライン切替で
// 大きさが揃わず不自然だった（実機フィードバック）。太さは描画側の
// strokeWidth だけで調整する。
const NAVIGATION_ICON_FILLED_PATH =
  "M480-240 222-130q-13 5-24.5 2.5T178-138q-8-8-10.5-20t2.5-25l273-615q5-12 15.5-18t21.5-6q11 0 21.5 6t15.5 18l273 615q5 13 2.5 25T782-138q-8 8-19.5 10.5T738-130L480-240Z";

// Places autocomplete のセッショントークン（課金束ね用）。render 中には
// 呼ばない（イベントハンドラから使う）。
function newSessionToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// 候補ピンの店名ラベルの文字設定（衝突計算の箱見積もりと描画で共有）。
const CANDIDATE_LABEL = { fontSize: 13, lineHeight: 16, maxWidth: 130 };
// ピンとラベルの間隔（px）。
const CANDIDATE_LABEL_GAP = 4;

// 選択中の行をその場で膨らませる（Phase 2）際の連続アニメーション用。
const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);
// スクロールで焦点行が変わるたびに focusProgress をそこへ寄せるスプリング
// （iOS ピッカーの「コツン」という手応えに寄せた、短く硬めの設定）。
const FOCUS_SPRING_CONFIG = { damping: 18, stiffness: 220, mass: 0.5 };
// 他の行が選択中の間、この行を沈める強さ（opacity-50 相当。旧 dimmedRow と同値）。
const FOCUS_DIM_OPACITY = 0.5;

// ピンが1つも無いときの初期表示（東京駅）。
const TOKYO_REGION = {
  latitude: TOKYO.lat,
  longitude: TOKYO.lng,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

// 一覧シート（browse）の「中身の高さ」の概算。値は下の styles から導出:
// 行 = placeRow の paddingVertical(10)×2 ＋ 名前1行(15pt→約18) ＋ メタ1行
// (12pt→約14 ＋ marginTop 2)、ヘッダー = sheetHeader の paddingTop(16)/
// paddingBottom(8) ＋ 1行(13pt→約16)。
// これは実測（FlatList の contentSize）が届くまでの1フレームぶんの繋ぎで、
// detent の最終的な高さは実測値で組み直す（下の browseSheet 参照）。
const LIST_ROW_H = 10 + 10 + 18 + 16;
const LIST_ROW_NOTE_H = 16; // note 付きの行の追加分（1行想定）
const LIST_HEADER_H = 16 + 8 + 16;
const LIST_BOTTOM_PADDING = 24; // styles.list の paddingBottom

function estimateListContentH(places: PlaceRow[]): number {
  return (
    LIST_HEADER_H +
    LIST_BOTTOM_PADDING +
    places.reduce(
      (h, p) => h + LIST_ROW_H + (p.note ? LIST_ROW_NOTE_H : 0),
      0,
    )
  );
}

// 地図・一覧を絞り込むフィルタの種類。エリアは labelByPlace の label
// （null＝ラベル無しの「その他」も区別して絞り込めるようにする）、
// 日にちは visitDayByPlace の dayIndex で揃える。
type PlaceFilter =
  | { kind: "area"; label: string | null }
  | { kind: "day"; dayIndex: number };

type SavedPlaceRowProps = {
  item: PlaceRow;
  index: number;
  isSelected: boolean;
  isLocating: boolean;
  day: VisitDay | undefined;
  area: string | null | undefined;
  focusProgress: SharedValue<number>;
  focusActive: SharedValue<number>;
  theme: Theme;
  styles: ReturnType<typeof makeStyles>;
  t: (key: string) => string;
  onStartLocate: () => void;
  onCancelLocate: () => void;
  onPreviewOrEdit: () => void;
};

// 保存済み場所の一覧行。FlatList の renderItem から呼ぶ。useAnimatedStyle を
// 安全に使うため、モジュールスコープの独立コンポーネントにする（renderItem に
// 直接書くと親の再レンダーのたびに関数の参照自体が作り直され、全行が
// アンマウント/再マウントされて reanimated の値が壊れる）。
function SavedPlaceRow({
  item,
  index,
  isSelected,
  isLocating,
  day,
  area,
  focusProgress,
  focusActive,
  theme,
  styles,
  t,
  onStartLocate,
  onCancelLocate,
  onPreviewOrEdit,
}: SavedPlaceRowProps) {
  const unmapped = item.lat == null;

  // theme.fgAlpha は普通の JS 関数（worklet ではない）。useAnimatedStyle の
  // 中から UI スレッド越しに直接呼ぶと "Tried to synchronously call a Remote
  // Function" で落ちる（実機/シミュレータで確認済み）。文字列に解決した
  // 結果だけを render 時（JS スレッド）に作り、worklet にはその文字列を
  // 渡す。
  const transparentBg = theme.fgAlpha(0);
  const highlightBg = theme.fgAlpha(0.06);

  // 選択中の行との「近さ」で opacity・背景ハイライトを連続的に決める
  // （Phase 2）。一覧のスクロール（PlacesTab 側の onViewableItemsChanged）が
  // focusProgress を動かすたびに、ここは自動で追従する。静止時は isSelected
  // の行が closeness=1（旧 selectedRow の背景と同値）、他は FOCUS_DIM_OPACITY
  // まで薄くなる。
  const rowFocusStyle = useAnimatedStyle(() => {
    const distance = Math.abs(index - focusProgress.value);
    const closeness = interpolate(distance, [0, 1], [1, 0], Extrapolation.CLAMP);
    return {
      opacity: 1 - focusActive.value * (1 - closeness) * (1 - FOCUS_DIM_OPACITY),
      backgroundColor: interpolateColor(
        focusActive.value * closeness,
        [0, 1],
        [transparentBg, highlightBg],
      ),
    };
  });

  return (
    <AnimatedPressable
      onPress={() =>
        isLocating
          ? onCancelLocate()
          : unmapped
            ? onStartLocate()
            : onPreviewOrEdit()
      }
      style={[
        styles.placeRow,
        isLocating && styles.locatingRow,
        // 選択中（プレビュー中）の行はその場で膨らませる（縦の余白を広げる。
        // 背景ハイライトは上の rowFocusStyle が担当）。
        isSelected && styles.selectedRow,
        rowFocusStyle,
      ]}
    >
      <PlaceCategoryIcon
        icon={item.icon}
        size={20}
        color={item.tentative ? "#f59e0b" : "#10b981"}
      />
      <View style={styles.placeInfo}>
        <View style={styles.placeNameRow}>
          <Text
            style={[styles.placeName, isSelected && styles.placeNameSelected]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          {item.visibility === "private" && (
            <LockIcon size={16} color={theme.mutedForeground} />
          )}
          {unmapped && (
            <View style={styles.unmappedBadge}>
              <Text style={styles.unmappedBadgeText}>{t("unmapped")}</Text>
            </View>
          )}
        </View>
        <Text style={styles.placeMeta}>
          {item.tentative ? t("statusCandidate") : t("statusConfirmed")}
          {" ・ "}
          {getIconLabel(item.icon)}
        </Text>
        {isSelected && item.formatted_address && (
          <Text style={styles.placeAddress} numberOfLines={2}>
            {item.formatted_address}
          </Text>
        )}
        {isSelected && (day || area) && (
          <View style={styles.placeBadgeRow}>
            {day && (
              <View style={styles.dayBadge}>
                <Text style={styles.dayBadgeText}>
                  {`${day.dayIndex}日目・${formatDayLabel(day.date)}`}
                </Text>
              </View>
            )}
            {area && <Text style={styles.areaBadgeText}>{area}</Text>}
          </View>
        )}
        {item.note ? (
          <Text style={styles.placeMeta} numberOfLines={2}>
            {item.note}
          </Text>
        ) : null}
      </View>
      {unmapped ? (
        <Text style={isLocating ? styles.cancelLocateLabel : styles.setPinLabel}>
          {isLocating ? t("cancelLocate") : t("setPin")}
        </Text>
      ) : (
        // プレビュー中（1タップ目・赤ピン選択）の行だけ、iOS標準の「＞」
        // ディスクロージャ表示を出す＝もう1タップで編集に進むことを示す
        // （本家 iOS リストの慣例と同じ見た目で表現）。
        isSelected && <ChevronIcon size={16} color={theme.mutedForeground} />
      )}
    </AnimatedPressable>
  );
}

// 場所タブ（RN・M5）: Google 地図 + 保存済みピン + 検索 + ドラッグ式ボトムシート
// 一覧 + 追加/編集。web の PlacesSection 相当。地図は PROVIDER_GOOGLE で世界観統一。
export default function PlacesTab() {
  const tripId = useTripId();
  const t = useTranslations("place");
  const tCommon = useTranslations("common");
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { data, me } = useTripDetail(tripId);
  const invalidate = useInvalidateTrip(tripId);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // react-native-screens の既知の挙動: この画面の裏に formSheet
  // （場所一覧・追加/編集フォーム）を重ねている間だけ insets.top が実機で
  // 0 に化ける（実測で確認済み）。sheet の detent 比率の分母
  // （下の referenceHeight）にそのまま使うと、シートが開くたびに分母が
  // ずれて上限が狙った位置より奥まで開いてしまう。0 以外の値が来た時だけ
  // 更新する「直近の正常値」ラッチで吸収する（向き固定＝portrait 専用
  // アプリなので、insets.top が正当な理由で 0 になるケースは無い前提）。
  // レンダー中に ref を書き換えると react-hooks/refs に弾かれるため、
  // React 公式の「レンダー中に state を調整する」パターン（useRef ではなく
  // useState + 条件付き setState）で持つ。
  const [stableInsetsTop, setStableInsetsTop] = useState(insets.top);
  if (insets.top > 0 && insets.top !== stableInsetsTop) {
    setStableInsetsTop(insets.top);
  }

  const mapRef = useRef<MapView>(null);
  // シートの開閉。どちらも native の formSheet（モーダル）で、開いた時だけ
  // 出す＝閉じている間は地図とタブバーが見える。常設にすると formSheet が
  // タブバー（浮島）を覆ってタブ移動できなくなるため、ボタンで開く方式にする。
  //   listOpen: 場所一覧（下の「一覧」ボタン / 検索実行で開く）
  //   formOpen: 追加/編集フォーム（候補・ピン・保存済みピンから開く）
  const [listOpen, setListOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  // 地図・一覧の両方を絞り込む場所フィルタ（エリア or 日にちのどちらか一方）。
  // null＝フィルタなし（全件表示）。下の filteredPlaces がこれを見て地図の
  // ピン・一覧の両方に同じ結果を反映する（web のエリアチップはカメラを
  // 寄せるだけで表示/非表示は変えないが、ここは「その場所だけ表示」という
  // 明示の要望なので実際に絞り込む）。
  const [placeFilter, setPlaceFilter] = useState<PlaceFilter | null>(null);
  // フィルタの選択肢シート。@gorhom の FormSheet ではなく他の一覧/編集フォーム
  // と同じ native formSheet（ScreenStackItem）にする＝native の摺りガラス
  // 質感・グラバー位置がその2つと揃う（実機フィードバック: FormSheet だと
  // 透明感が無く、ヘッダーの上余白も他と食い違って見えていた）。
  const [filterOpen, setFilterOpen] = useState(false);
  // 一覧シート（browse）の中身の実測高さ（FlatList の contentSize）。detent を
  // 「中身にフィット」と「その半分」の2段で組むのに使う（下の browseSheet）。
  const [browseContentH, setBrowseContentH] = useState<number | null>(null);
  // 一覧の FlatList。地図のピンから選んだ行を見える位置までスクロールする。
  const placeListRef = useRef<FlatList<PlaceRow>>(null);
  const candidateListRef = useRef<FlatList<PlaceCandidate>>(null);
  // 「今の選択は地図側の操作で決まった」印。地図のピンをタップして選んだときは
  // 一覧シート側でもその行を見える位置へ運ぶ（シートを小さい detent に下げると
  // 見える範囲が狭く、選択中の行が画面外のままになって「どれを選んだのか」が
  // 分からなくなるため）。一覧の行を自分でタップしたときは動かさない＝触った
  // 位置でリストが飛ぶのを避ける。
  const scrollToSelectionRef = useRef(false);

  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  // 入力中サジェスト（web の検索窓ドロップダウンと同じ）。debounce + 課金
  // 最適化のセッショントークン。
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // サジェストの世代番号。閉じるたびに進め、古い世代の応答は捨てる。
  const suggestEpochRef = useRef(0);
  const sessionTokenRef = useRef<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] =
    useState<PlaceCandidate | null>(null);
  const [editing, setEditing] = useState<PlaceRow | null>(null);

  // Phase 2: 一覧をスクロールするだけで選択行が次々切り替わる（iOS の
  // ピッカー/ドラムロールと同じ操作感。長押し＋ドラッグ案は「誰も気づかない」
  // というフィードバックで撤回した）。focusProgress は places 配列の
  // インデックス単位の連続値で、行の opacity/背景ハイライト（rowFocusStyle）
  // が常にこれを見て追従する。UIスレッドで直接書き込むので高頻度の更新でも
  // React 再レンダーは発生しない。
  const focusProgress = useSharedValue(0);
  // 何か選択中か（0〜1）。選択の出入りで薄さの効き具合をフェードさせる。
  const focusActive = useSharedValue(0);
  // スクロールで「今どの行が主役か」が変わるたびに更新する参照値。
  // onScroll は同じインデックスでも何度も呼ばれるので、ここと比較して本当に
  // 変わった時だけハプティック/地図追従を起こす。
  const liveFocusIndexRef = useRef(-1);
  // 今ユーザーが指で一覧をスクロールしている最中か。行の展開（LayoutAnimation
  // による高さの変化）だけでも FlatList は onScroll を発火させ得るため、本当に
  // ユーザーがスクロールを始めた時だけピッカーとして反応させる。
  const isUserScrollingRef = useRef(false);
  // 一覧シート（FlatList）の実測される可視高さ。中央のデータを選択状態に
  // する（iOS ピッカーと同じ）ための行位置計算と、端の行までスワイプで
  // 中央に持ってこられるようにする上下パディングの両方に使う。
  const [sheetViewportHeight, setSheetViewportHeight] = useState(0);
  // 検索バーの下端の絶対位置（画面座標）。一覧シートの上限をこの下端に
  // 揃える（実機フィードバック: 場所が多いと「中身にフィット」がどこまでも
  // 伸びて検索バーまで隠してしまうため）ために実測する。
  const searchBarRef = useRef<View>(null);
  const [searchBarBottomY, setSearchBarBottomY] = useState(0);
  // タップ確定・スクロール確定の直後1回だけ、下の同期 useEffect による
  // focusProgress の再アニメーションを止めるためのラッチ（確定直前に既に
  // その位置へ動かしてある時、withTiming で二重にアニメーションさせない）。
  const justCommittedRef = useRef(false);
  // 未選択→選択（タップ）時だけシートが fit→半分 detent へアニメーション
  // 遷移する。その間 sheetViewportHeight の実測が古いままなので、遷移が
  // 落ち着く（FlatList の onLayout が一定時間発火しなくなる）まで運ぶ先の
  // インデックスをここに置いて待つ（下の onLayout 節参照）。
  const pendingCenterIndexRef = useRef<number | null>(null);
  const pendingCenterScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // 地図長押しで置いた仮ピン（web の draft ピンと同じ。保存/閉じで消す）。
  const [pinDraft, setPinDraft] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  // 「位置を指定」モード（web の pendingLocationFor と同じ）: 地図未登録の
  // 場所を一覧でタップ → 地図をタップ/長押しでその場所に座標を設定する。
  const [locating, setLocating] = useState<{ id: string; name: string } | null>(
    null,
  );
  // 候補ピンの店名ラベル配置用: 現在のリージョン（パン/ズーム確定ごと）と
  // 地図ビューの実寸。ジェスチャ中は再計算せず、確定時に一括で振り直す
  // （本家 Google マップのラベル再配置と同じタイミング）。
  const [region, setRegion] = useState<Region | null>(null);
  const [mapSize, setMapSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  // 現在地（青丸）。showsUserLocation の native 描画は Google の内部レイヤーが
  // 独自の重なり順を持ち、確定ピンの zIndex をいじっても後ろに隠れたまま
  // だった（実機検証済み）。自前の Marker として描くことで確定ピンより
  // 手前に出せるようにする。userCoordRef は「現在地に戻る」ボタンのカメラ
  // 移動先として使う値（state と同じ座標を都度反映）。
  const [myLocation, setMyLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const userCoordRef = useRef<{ latitude: number; longitude: number } | null>(
    null,
  );
  // 現在地に戻るボタンの塗り状態: 現在地を中心に据えた直後だけ青塗り、
  // ユーザがジェスチャで地図を動かしたらアウトラインに戻す
  // （本家 Google マップ・iOS マップと同じ）。
  const [followingLocation, setFollowingLocation] = useState(false);

  // 地図の向き（真北からの回転角）。react-native-maps の Region には heading
  // が含まれないため、region が変わるたびに getCamera() で都度取得する。
  // 真北を向いている（0度）時だけ方位磁針を隠す（本家 Google マップ・iOS
  // マップと同じ）。
  const [heading, setHeading] = useState(0);

  // 縮尺バー（本家 Google マップと同じ: 拡大縮小を「始めた瞬間」から右下に出て
  // 約5秒後にフェードアウト）。region（候補ラベル用・onRegionChangeComplete
  // でのみ更新）とは別に、ジェスチャ中に連続発火する onRegionChange で
  // scaleRegion を都度更新する＝バーの数値もズーム中ずっとライブ追従する。
  const [scaleRegion, setScaleRegion] = useState<Region | null>(null);
  const [scaleOpacity] = useState(() => new Animated.Value(0));
  const scaleHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevLatDeltaRef = useRef<number | null>(null);
  const flashScaleBar = () => {
    if (scaleHideTimer.current) clearTimeout(scaleHideTimer.current);
    Animated.timing(scaleOpacity, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
    scaleHideTimer.current = setTimeout(() => {
      Animated.timing(scaleOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }, 5000);
  };

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;
    void (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted" || cancelled) return;
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 3000, distanceInterval: 10 },
        (loc) => {
          const coord = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          userCoordRef.current = coord;
          setMyLocation(coord);
        },
      );
    })();
    return () => {
      cancelled = true;
      subscription?.remove();
      if (scaleHideTimer.current) clearTimeout(scaleHideTimer.current);
    };
  }, []);

  // 一覧は訪問順（紐づく予定/費用の最も早い日時）。群分けの規則は
  // placeOrder.ts 参照。TZ を跨ぐ旅程でも順序が狂わないよう、旅程タイムライン
  // から実効TZを解決した絶対時刻で比べる。
  const places = useMemo(() => {
    if (!data) return [];
    const scheduleEvents = deriveScheduleEvents(data.eventsRaw, data.todosRaw);
    const tzTimeline = buildTripTzTimeline(
      scheduleEvents,
      data.trip?.default_timezone,
    );
    return sortPlacesByItinerary(
      derivePlaces(data.placesRaw),
      scheduleEvents,
      deriveOrderedExpenses(data.expensesRaw, tzTimeline),
      tzTimeline,
    );
  }, [data]);

  // 展開した行に出す「◯日目・M/D(曜)」バッジ用。予定/費用のどちらにも
  // 紐づかない場所は日時不明なので Map に含まれず、バッジ無しになる。
  const dayByPlaceId = useMemo(() => {
    if (!data?.trip?.start_date) return new Map<string, VisitDay>();
    const scheduleEvents = deriveScheduleEvents(data.eventsRaw, data.todosRaw);
    const tzTimeline = buildTripTzTimeline(
      scheduleEvents,
      data.trip?.default_timezone,
    );
    return visitDayByPlace(
      scheduleEvents,
      deriveOrderedExpenses(data.expensesRaw, tzTimeline),
      tzTimeline,
      data.trip.start_date,
    );
  }, [data]);

  // エリアフィルタの並び順（旅程順）に使う、場所ごとの最初の訪問絶対時刻。
  // dayIndex（日単位）だと「成田発・ホノルル着」が同じ1日目に収まる旅程で
  // タイになり成田→ハワイの順が出せないため、ms 精度の方を使う。
  const earliestMsByPlaceId = useMemo(() => {
    if (!data) return new Map<string, number>();
    const scheduleEvents = deriveScheduleEvents(data.eventsRaw, data.todosRaw);
    const tzTimeline = buildTripTzTimeline(
      scheduleEvents,
      data.trip?.default_timezone,
    );
    return earliestVisitByPlace(
      scheduleEvents,
      deriveOrderedExpenses(data.expensesRaw, tzTimeline),
      tzTimeline,
    );
  }, [data]);

  // 展開した行に出すエリアバッジ用。地図の初期表示（initialRegion）と同じ
  // クラスタリング規則で、場所ごとにどのエリアに属すかを引けるようにする。
  const areaByPlaceId = useMemo(() => {
    const mapped = places.filter((p) => p.lat != null && p.lng != null);
    return labelByPlace(
      mapped.map((p) => ({
        id: p.id,
        lat: p.lat as number,
        lng: p.lng as number,
        region: p.region,
        locality: p.locality,
      })),
    );
  }, [places]);

  // フィルタメニューの選択肢。常に全件（places）から出す＝フィルタ中でも
  // 他の選択肢が消えず切り替えられる。エリアは件数の多い順、日にちは
  // 旅程順（dayIndex 昇順）。
  const areaFilterOptions = useMemo(() => {
    const counts = new Map<string | null, number>();
    // エリアの並び順＝旅程順（そのエリアに最初に訪れる場所の絶対時刻が
    // 早い順）。「成田→ハワイ」の旅程なら千葉県が先に来るようにする
    // （件数順だと訪問先が多いエリアが先頭に来て旅程と噛み合わない、との
    // 実機フィードバック）。
    const earliestMs = new Map<string | null, number>();
    for (const [placeId, label] of areaByPlaceId) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
      const ms = earliestMsByPlaceId.get(placeId);
      if (ms != null) {
        const cur = earliestMs.get(label);
        if (cur == null || ms < cur) earliestMs.set(label, ms);
      }
    }
    return [...counts.entries()].sort((a, b) => {
      const ma = earliestMs.get(a[0]) ?? Infinity;
      const mb = earliestMs.get(b[0]) ?? Infinity;
      // 旅程が分からない（日時未定）エリア同士は件数の多い順で並べる。
      return ma !== mb ? ma - mb : b[1] - a[1];
    });
  }, [areaByPlaceId, earliestMsByPlaceId]);

  const dayFilterOptions = useMemo(() => {
    const byDay = new Map<
      number,
      { dayIndex: number; date: string; count: number }
    >();
    for (const day of dayByPlaceId.values()) {
      const cur = byDay.get(day.dayIndex);
      if (cur) cur.count += 1;
      else byDay.set(day.dayIndex, { ...day, count: 1 });
    }
    return [...byDay.values()].sort((a, b) => a.dayIndex - b.dayIndex);
  }, [dayByPlaceId]);

  const matchesPlaceFilter = useCallback(
    (placeId: string, f: PlaceFilter): boolean =>
      f.kind === "area"
        ? areaByPlaceId.get(placeId) === f.label
        : dayByPlaceId.get(placeId)?.dayIndex === f.dayIndex,
    [areaByPlaceId, dayByPlaceId],
  );

  // 地図のピン・一覧の両方がこれを見る（フィルタ無しは全件）。
  const filteredPlaces = useMemo(
    () =>
      placeFilter
        ? places.filter((p) => matchesPlaceFilter(p.id, placeFilter))
        : places,
    [places, placeFilter, matchesPlaceFilter],
  );

  const placeFilterLabel = (f: PlaceFilter): string =>
    f.kind === "area"
      ? (f.label ?? t("other"))
      : `${f.dayIndex}日目・${formatDayLabel(
          dayFilterOptions.find((d) => d.dayIndex === f.dayIndex)?.date ?? "",
        )}`;

  // フィルタ選択（解除＝null も含む）。選んだフィルタの範囲外に選択中の
  // 場所（editing）があれば、地図上のピンと表示が食い違わないよう選択を
  // 解除する。範囲が見えるよう地図もそこへ合わせる。
  const applyPlaceFilter = (f: PlaceFilter | null) => {
    setPlaceFilter(f);
    setFilterOpen(false);
    if (editing && f && !matchesPlaceFilter(editing.id, f)) {
      setEditing(null);
      setFormOpen(false);
    }
    const target = f ? places.filter((p) => matchesPlaceFilter(p.id, f)) : places;
    const mapped = target.filter(
      (p): p is PlaceRow & { lat: number; lng: number } =>
        p.lat != null && p.lng != null,
    );
    if (mapped.length === 0) return;
    // react-native-maps の fitToCoordinates は素朴な緯度経度の外接矩形なので、
    // 日付変更線を跨ぐ範囲（成田↔ホノルル等）で地球の反対側が中心になる
    // （initialRegion と同じ落とし穴、ui-guidelines「地図の表示範囲」参照）。
    // 同じ dateline 対応の boundsOf/centerOf で組む。
    const b = boundsOf(mapped.map((p) => ({ lat: p.lat, lng: p.lng })));
    if (!b) return;
    const c = centerOf(b);
    const lngSpan = b.west <= b.east ? b.east - b.west : b.east + 360 - b.west;
    mapRef.current?.animateToRegion(
      {
        latitude: c.lat,
        longitude: c.lng,
        latitudeDelta: Math.max(0.05, (b.north - b.south) * 1.5),
        longitudeDelta: Math.max(0.05, lngSpan * 1.5),
      },
      300,
    );
  };

  // focusProgress 同期用に、選択中の場所が filteredPlaces 配列の何番目かを
  // 引く（一覧に実際に描画される配列＝フィルタ適用後のものと揃える）。
  const editingIndex = useMemo(
    () => (editing ? filteredPlaces.findIndex((p) => p.id === editing.id) : -1),
    [editing, filteredPlaces],
  );
  // editing（タップ・スクロール確定どちらでも変わる）に
  // focusProgress/focusActive を追従させる。スクロール中の直接書き込み
  // （onViewableItemsChanged）はこの effect を経由しないので、ここは
  // 「選択が変わった後の着地」だけを担当する。
  useEffect(() => {
    liveFocusIndexRef.current = editingIndex;
    if (justCommittedRef.current) {
      // 直前に onViewableItemsChanged 側で既に withSpring で同じ位置へ
      // 動かし済み。二重にアニメーションを起こしてイーズを乱さないよう、
      // この1回だけ何もしない。
      justCommittedRef.current = false;
      return;
    }
    if (editingIndex < 0) {
      focusActive.value = withTiming(0, { duration: 200 });
      return;
    }
    const wasActive = focusActive.value > 0.5;
    focusActive.value = withTiming(1, { duration: 200 });
    // 無選択からの初回選択はいきなり合わせる（無関係な行を横切る見た目の
    // スイープを防ぐ）。選択中の切り替え（タップ確定）だけ滑らかに動かす。
    focusProgress.value = wasActive
      ? withTiming(editingIndex, { duration: 220 })
      : editingIndex;
    // focusActive/focusProgress は useSharedValue の戻り値＝ref と同じく参照が
    // 安定しているので、依存配列に入れても effect の再発火条件は editingIndex
    // だけのまま変わらない（exhaustive-deps を素直に満たすために追加）。
  }, [editingIndex, focusActive, focusProgress]);

  // 初期リージョン: 既存ピンの範囲/重心、無ければ東京。
  const initialRegion: Region = useMemo(() => {
    // 「ピンが集まっているところ」を映す。全ピンの外接矩形だと、離れた1点
    // （帰りの空港など）に引っ張られて誰も居ない海の上が中心になる。
    // エリアでクラスタリングし、主役（最多ピンが単独で最大）があればそこだけ、
    // 決まらなければ全ピンに合わせる — web の place-map と同じ規則。
    const mapped = places.filter((p) => p.lat != null && p.lng != null);
    const clusters = clusterPlaces(
      mapped.map((p) => ({
        lat: p.lat as number,
        lng: p.lng as number,
        region: p.region,
        locality: p.locality,
      })),
    );
    const main = dominantCluster(clusters);
    const focus = (main ? main.points : mapped).map((p) => ({
      lat: p.lat as number,
      lng: p.lng as number,
    }));

    const b = boundsOf(focus);
    if (!b) {
      return { ...TOKYO_REGION };
    }
    // 中心は centerOf に任せる。自前で (west+east)/2 とすると、日付変更線を
    // 跨ぐ bounds（west>east）で地球の反対側が中心になる（成田＋ホノルルで
    // モロッコが出た実バグ）。
    const c = centerOf(b);
    // 経度スパンも跨ぎを考慮して正の値にする。
    const lngSpan = b.west <= b.east ? b.east - b.west : b.east + 360 - b.west;
    return {
      latitude: c.lat,
      longitude: c.lng,
      latitudeDelta: Math.max(0.05, (b.north - b.south) * 1.5),
      longitudeDelta: Math.max(0.05, lngSpan * 1.5),
    };
  }, [places]);

  // 候補ピンの店名ラベル配置（greedy 衝突回避）。選択中を先頭にして
  // 一番良い位置（右）を優先的に取らせる。
  const labelPlacements = useMemo<Record<string, LabelPlacement>>(() => {
    if (!mapSize || candidates.length === 0) return {};
    const selectedId = selectedCandidate?.placeId ?? null;
    const items = [...candidates]
      .sort((a, b) =>
        a.placeId === selectedId ? -1 : b.placeId === selectedId ? 1 : 0,
      )
      .map((c) => ({
        id: c.placeId,
        lat: c.lat,
        lng: c.lng,
        pin: candidatePinSize(c.rating),
        label: estimateLabelBox(c.name, CANDIDATE_LABEL),
      }));
    return layoutLabels(
      items,
      region ?? initialRegion,
      mapSize,
      CANDIDATE_LABEL_GAP,
    );
  }, [candidates, selectedCandidate, region, initialRegion, mapSize]);

  // 縮尺バーの値（実距離とバー幅）。最大 100px 分の実距離を 1/2/5 刻みに丸める。
  const scaleBar = useMemo(
    () =>
      mapSize
        ? computeScaleBar(scaleRegion ?? region ?? initialRegion, mapSize, 100)
        : null,
    [scaleRegion, region, initialRegion, mapSize],
  );

  // 地図のピンから選んだ行を、一覧シート側でも見える位置まで運ぶ
  // （scrollToSelectionRef の宣言コメント参照）。行の先頭を一覧の上端に
  // 合わせる＝そのあとシートを小さい detent へ下げても隠れにくい。
  useEffect(() => {
    // 一覧が閉じている間は印を持ち越す＝地図のピンで選んでから一覧を開いた
    // ときも、開いた時点でその行まで運ぶ。
    if (!listOpen || !scrollToSelectionRef.current) return;
    scrollToSelectionRef.current = false;
    const index = selectedCandidate
      ? candidates.findIndex((c) => c.placeId === selectedCandidate.placeId)
      : editing
        ? filteredPlaces.findIndex((p) => p.id === editing.id)
        : -1;
    if (index < 0) return;
    if (selectedCandidate) {
      candidateListRef.current?.scrollToIndex({ index, viewPosition: 0 });
    } else {
      placeListRef.current?.scrollToIndex({ index, viewPosition: 0 });
    }
  }, [listOpen, editing, selectedCandidate, candidates, filteredPlaces]);

  // ピン選択時のカメラ移動は本家 Google マップと同じ「ズームは一切変えず
  // パンだけ」。狙い位置は「フォームシートに隠れない画面上寄り（上から約25%）」
  // （中央に置くと下から出るフォームシートとちょうど重なる）。既にほぼ狙い
  // 位置にあるピンは動かさない — 判定は本家同様厳しめ（画面の各軸10%以内）で、
  // 少しでも端にあれば寄せる。ピンタップ時は Google SDK 既定の「ピンを中央へ」
  // アニメーションと競合するので、フォームを開く各経路で必ずこれを呼び、
  // 動かさない場合も現在中心への移動を発行して SDK 既定の移動を打ち消す。
  const focusCoord = (lat: number, lng: number) => {
    // 狙い位置のオフセットは表示範囲の高さ（latitudeDelta）に比例するので、
    // **必ず呼び出し時点の実際の表示範囲を地図から取る**。React の state
    // （region / scaleRegion）はスナップショットで、ジェスチャ中や直前の
    // カメラアニメーションが収まっていない間は古い＝広い値を掴むことがあり、
    // その場合オフセットが桁違いに大きくなって地図が全く違う場所へ飛ぶ
    // （ピンチ中に指がマーカーに触れてタップ判定された時に実際に発生）。
    // getMapBoundaries は現在の描画範囲を返すので、この経路には古い値が来ない。
    void (async () => {
      const map = mapRef.current;
      if (!map) return;
      let latDelta: number;
      let center0: { latitude: number; longitude: number };
      try {
        const b = await map.getMapBoundaries();
        latDelta = b.northEast.latitude - b.southWest.latitude;
        center0 = {
          latitude: (b.northEast.latitude + b.southWest.latitude) / 2,
          longitude: (b.northEast.longitude + b.southWest.longitude) / 2,
        };
      } catch {
        // 取得できない場合だけ state にフォールバックする。
        const r = scaleRegion ?? region ?? initialRegion;
        latDelta = r.latitudeDelta;
        center0 = { latitude: r.latitude, longitude: r.longitude };
      }
      const lngDelta =
        (scaleRegion ?? region ?? initialRegion).longitudeDelta || latDelta;
      // ピンを画面の上から25%に置く＝中心はピンより latDelta の 1/4 南。
      const center = { latitude: lat - latDelta * 0.25, longitude: lng };
      const dx = Math.abs(center.longitude - center0.longitude) / lngDelta;
      const dy = Math.abs(center.latitude - center0.latitude) / latDelta;
      const nearTarget = dx < 0.1 && dy < 0.1;
      // ピンタップ時は Google SDK 既定の「ピンを中央へ」アニメーションと競合する
      // ので、動かさない場合も現在中心への移動を発行して打ち消す。
      map.animateCamera({ center: nearTarget ? center0 : center });
    })();
  };

  if (!data?.trip || !me) return null;

  const pinOptions = (data.pinOptionsRaw ?? []) as PinOption[];
  // 未確定ピンの色 = 作成者のメンバー hue（web の place-map と同じ）。
  const memberHueById = new Map(
    (data.members ?? []).map((m) => [m.id, m.color]),
  );

  const biasCenter = () =>
    dominantCenter(
      places
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => ({ lat: p.lat as number, lng: p.lng as number })),
    ) ?? undefined;

  // 入力中サジェストを閉じる唯一の経路。保留中の debounce タイマーと、既に
  // 飛んでいる fetch の応答（閉じた後に届いて窓を開き直すのが「開きっぱなし」の
  // 原因）の両方を世代番号で無効化する。閉じたい全経路がこれを呼ぶ。
  const closeSuggestions = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    suggestEpochRef.current += 1;
    setPredictions([]);
  };

  // 入力ごとにサジェストを引く（web と同じ 300ms debounce）。1 セッションの
  // 課金トークンを維持し、確定（details）で消費する。
  const onQueryChange = (v: string) => {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!PLACES_API_KEY || !v.trim()) {
      closeSuggestions();
      return;
    }
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = newSessionToken();
    }
    debounceRef.current = setTimeout(() => {
      const epoch = suggestEpochRef.current;
      void autocompletePlaces(v, {
        apiKey: PLACES_API_KEY,
        iosBundleId: BUNDLE_ID,
        biasCenter: biasCenter(),
        sessionToken: sessionTokenRef.current ?? undefined,
      })
        .then((r) => {
          if (epoch === suggestEpochRef.current) setPredictions(r);
        })
        .catch(() => {
          if (epoch === suggestEpochRef.current) setPredictions([]);
        });
    }, 300);
  };

  // サジェスト確定: details で座標・住所を補完し、候補ピンを立てて保存フォームへ
  // （web の pick → fetchFields と同じ。session トークンをここで消費）。
  const pickPrediction = async (p: PlacePrediction) => {
    if (!PLACES_API_KEY) return;
    // 候補を選んだら入力は終わり＝キーボードを畳む（地図とフォームを見せる）。
    Keyboard.dismiss();
    closeSuggestions();
    // 登録済みの場所なら details を引かず（課金なし）既存を開く。
    const saved = findSavedByGoogleId(p.placeId);
    if (saved) {
      setQuery("");
      openEditPlace(saved);
      return;
    }
    try {
      const c = await fetchPlaceDetails(p.placeId, {
        apiKey: PLACES_API_KEY,
        iosBundleId: BUNDLE_ID,
        sessionToken: sessionTokenRef.current ?? undefined,
      });
      sessionTokenRef.current = null; // セッション終了
      if (!c) return;
      setCandidates([c]);
      openAddCandidate(c);
    } catch (e) {
      Alert.alert(t("searchFailed"), String(e));
    }
  };

  // 検索窓の × （本家 Google マップと同じ: 何か入力されている間だけ右端に出る）。
  // web の clearSearch と同値＝入力・サジェスト・検索結果（候補ピン）をまとめて
  // 捨てて検索前に戻す。候補から開いていた追加フォームも中身が無くなるので畳む
  // （保存済みの場所の編集フォームは検索と無関係なのでそのまま）。
  const clearSearch = () => {
    setQuery("");
    closeSuggestions();
    setCandidates([]);
    if (selectedCandidate) {
      setSelectedCandidate(null);
      setFormOpen(false);
    }
  };

  const runSearch = async () => {
    if (!PLACES_API_KEY || !query.trim()) return;
    // 検索実行＝入力は終わり。キーボードと入力中サジェストを畳んで
    // 地図（候補ピン）と結果一覧を見せる。
    Keyboard.dismiss();
    closeSuggestions();
    setSearching(true);
    try {
      const bias = dominantCenter(
        places
          .filter((p) => p.lat != null && p.lng != null)
          .map((p) => ({ lat: p.lat as number, lng: p.lng as number })),
      );
      const results = await searchPlaces(query, {
        apiKey: PLACES_API_KEY,
        iosBundleId: BUNDLE_ID,
        biasCenter: bias ?? undefined,
      });
      setCandidates(results);
      if (results[0]) {
        mapRef.current?.animateToRegion({
          latitude: results[0].lat,
          longitude: results[0].lng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
        // 検索実行で一覧シートを開いて結果を見せる。
        setListOpen(true);
      }
    } catch (e) {
      // 失敗は握りつぶさず見せる（原因の詳細付き。実機でのキー制限・
      // ネットワーク問題の切り分けに使う）。
      Alert.alert(t("searchFailed"), String(e));
      setCandidates([]);
    } finally {
      setSearching(false);
    }
  };

  // region 確定（パン/ズーム終了）ごとに: 候補ラベル配置の再計算に使う state
  // を更新しつつ、縮尺バーは「ズーム量（緯度スパン）が変わった時だけ」出す
  // （パンだけでは出さない。本家 Google マップと同じ）。
  const onRegionChangeComplete = (r: Region) => {
    setRegion(r);
    setScaleRegion(r);
  };

  // ジェスチャ中に連続発火する方（候補ラベルの再配置には使わない・重いため）。
  // 縮尺バーは本家 Google マップと同じく「拡大縮小を始めた瞬間」から見せたい
  // ので、確定(onRegionChangeComplete)を待たずここでズーム量の変化を見て出す。
  const onRegionChange = (r: Region, details?: Details) => {
    setScaleRegion(r);
    const prev = prevLatDeltaRef.current;
    prevLatDeltaRef.current = r.latitudeDelta;
    if (prev != null && Math.abs(r.latitudeDelta - prev) / prev > 0.001) {
      flashScaleBar();
    }
    // ユーザ自身のジェスチャで地図を動かしたら「現在地に戻る」ボタンの
    // 青塗り状態を解除する（本家 Google マップ・iOS マップと同じ）。
    if (details?.isGesture) setFollowingLocation(false);
    // Region に heading は含まれないため、変化のたびに現在のカメラ向きを
    // 取得して方位磁針の表示判定に使う。
    void mapRef.current
      ?.getCamera()
      .then((cam) => setHeading(cam.heading ?? 0))
      .catch(() => {});
  };

  // 「現在地に戻る」ボタン: watchPositionAsync が拾った最新座標へズームは
  // 変えずパンだけ（本家 Google マップの現在地ボタンと同じ）。まだ座標が
  // 無ければ（起動直後等）権限確認の上その場で1回取得する。
  const goToMyLocation = async () => {
    let coord = userCoordRef.current;
    if (!coord) {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert(
          "現在地を利用できません",
          "設定アプリで位置情報の利用を許可してください。",
        );
        return;
      }
      try {
        const pos = await Location.getCurrentPositionAsync({});
        coord = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
      } catch (e) {
        Alert.alert("現在地を取得できませんでした", String(e));
        return;
      }
    }
    mapRef.current?.animateCamera({ center: coord });
    setFollowingLocation(true);
  };

  // 方位磁針タップ: 真北を上に戻す（本家 Google マップ・iOS マップと同じ）。
  const resetHeading = () => {
    mapRef.current?.animateCamera({ heading: 0 });
  };

  // この Google place が旅行に登録済みなら、その保存済みの場所を返す
  // （同じ店を POI タップ・検索・候補ピンから何度でも追加できてしまい、
  // 重複登録される実機報告への対策。同じ場所なら追加ではなく既存を開く）。
  const findSavedByGoogleId = (googlePlaceId: string) =>
    places.find((p) => p.google_place_id === googlePlaceId) ?? null;

  const openAddCandidate = (c: PlaceCandidate) => {
    const saved = findSavedByGoogleId(c.placeId);
    if (saved) {
      openEditPlace(saved);
      return;
    }
    // 地図（POI タップ）・検索窓のサジェスト由来＝一覧の行タップではないので、
    // 背後の一覧でもその行を見える位置へ運ぶ。
    scrollToSelectionRef.current = true;
    setSelectedCandidate(c);
    setEditing(null);
    setPinDraft(null);
    closeSuggestions();
    focusCoord(c.lat, c.lng);
    setFormOpen(true);
  };

  // 地図長押し: その座標に仮ピンを置き、名前を入力して保存するフォームを開く
  // （web の「長押しでピンを置く → ピンを設定」と同じ）。
  const onMapLongPress = (lat: number, lng: number) => {
    setPinDraft({ lat, lng });
    setEditing(null);
    setSelectedCandidate(null);
    closeSuggestions();
    focusCoord(lat, lng);
    setFormOpen(true);
  };

  // ベースマップの POI（Google の店・施設アイコン）タップ: Place Details で
  // 住所・region を補完して、検索候補と同じ保存フォームを開く（web の POI
  // タップ→追加と同じ入口）。
  // 座標は Details の location でなく「タップした POI アイコンの座標」
  // （onPoiClick の coordinate）で上書きする。Details の座標は建物重心など
  // ベースマップの POI アイコン描画位置と数m ずれることがあり、登録後の
  // 自前マーカーが POI と二重にずれて見える実機報告への対策（アイコン位置に
  // 揃えれば自前マーカーがベース POI にぴったり重なる）。
  const onPoiPress = async (
    placeId: string,
    coord: { latitude: number; longitude: number },
  ) => {
    if (!PLACES_API_KEY) return;
    // 登録済みの POI なら details を引かず（課金なし）既存を開く。
    const saved = findSavedByGoogleId(placeId);
    if (saved) {
      openEditPlace(saved);
      return;
    }
    try {
      const c = await fetchPlaceDetails(placeId, {
        apiKey: PLACES_API_KEY,
        iosBundleId: BUNDLE_ID,
      });
      if (c) {
        openAddCandidate({
          ...c,
          lat: coord.latitude,
          lng: coord.longitude,
        });
      }
    } catch (e) {
      Alert.alert(t("searchFailed"), String(e));
    }
  };
  // 保存済みの場所を開く（検索サジェスト確定・POIタップから）: そのピンへ寄せ、
  // ピンを本家と同じ赤ピンに差し替えて編集シートを出す。場所名の吹き出しは
  // 出さない（名前はボトムシートにある。本家も出さない）。これらは「探して
  // 選んだ」流れなので1タップで編集を開く。一覧の行・地図の自前ピンタップは
  // previewOrEditPlace（1タップ目はプレビュー・2タップ目で編集）を使う。
  const openEditPlace = (p: PlaceRow) => {
    // 一覧の行タップ以外（地図の POI・検索サジェスト）からの選択なので、背後の
    // 一覧でもその行を見える位置へ運ぶ。
    scrollToSelectionRef.current = true;
    setEditing(p);
    setSelectedCandidate(null);
    closeSuggestions();
    if (p.lat != null && p.lng != null) focusCoord(p.lat, p.lng);
    setFormOpen(true);
  };

  // 「p を選択（プレビュー）状態にする」共通処理。タップ起点
  // （previewOrEditPlace）とスクロール確定起点（handleScrollSettle、下の
  // onMomentumScrollEnd 節）の両方から呼ぶ。選択行がその場で膨らむ（住所・
  // 日付/エリアバッジが現れる）分の高さ変化は LayoutAnimation で自動
  // 補間する（FlatList の唯一の子制約があるため、行の高さそのものを
  // reanimated で追わない。連続的な見た目の変化は rowFocusStyle の
  // opacity/背景色だけが担う。下の renderItem 節参照）。
  const commitPreviewPlace = (p: PlaceRow) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedCandidate(null);
    setEditing(p); // 選択（赤ピン）
    closeSuggestions();
    if (p.lat != null && p.lng != null) focusCoord(p.lat, p.lng); // 地図を寄せる
  };

  // 一覧の保存済み（地図あり）の行タップ・地図上の確定済みピンタップの両方が
  // ここを通る: 1タップ目は地図をそのピンへ寄せて赤ピンで選択表示し、一覧
  // シートを開くだけ（編集フォームは出さない）＝一覧を見ながら／地図を眺め
  // ながら次々にプレビューできる。同じ場所をもう1タップ（＝選択中）で編集
  // フォームを開く。
  const previewOrEditPlace = (p: PlaceRow) => {
    if (editing?.id === p.id) {
      setFormOpen(true); // 2タップ目: 編集
      return;
    }
    // 今まさに未選択→選択になる（＝これからシートが fit→半分 detent へ
    // アニメーション遷移する）かを、setEditing する前に判定しておく。
    const enteringPickerMode = editing == null;
    commitPreviewPlace(p);
    setListOpen(true); // 地図のピンタップからも一覧を見せる（一覧はすでに開いていれば変化なし）
    // タップでの選択もスワイプ選択と同じく行を一覧の中央に置く（Phase 2）。
    //
    // scrollToIndex（viewPosition 指定）は使わない: FlatList 内部の
    // 「まだ描画/計測していない行は averageItemLength で推定する」仕組みが、
    // 場所数が多く一覧が下まで未計測な状態だと大きくズレる（実機フィード
    // バックで確認: 一覧の下の方の行をタップすると全然違う行が中央に来る）。
    // 代わりに applyPickerFocus（下）の中央判定式をそのまま逆算した
    // scrollToOffset を使う。同じ式の逆算なので、ここでスクロールした位置と
    // applyPickerFocus が「中央」と判定する行が常に一致する
    // （FlatList 自身の推定に頼らないので一覧の実測状態に左右されない）。
    const index = filteredPlaces.findIndex((pl) => pl.id === p.id);
    if (index < 0) return;
    if (enteringPickerMode) {
      // シートが fit→半分へアニメーション遷移する間、sheetViewportHeight の
      // 実測（FlatList の onLayout）は古い値のまま追いつかない。今すぐ運ぶと
      // 遷移前の高さを基準に計算してズレる（実機フィードバックで確認: 選択
      // した行が下の方に隠れて出た）。onLayout 側（下）で遷移が落ち着くのを
      // 待ってから実際に運ぶ。
      pendingCenterIndexRef.current = index;
    } else {
      // 既に半分 detent＝高さは変わらないのですぐ運んでよい。
      requestAnimationFrame(() => {
        const offset =
          pickerTopPad +
          LIST_HEADER_H +
          (index + 0.5) * LIST_ROW_H -
          sheetViewportHeight / 2;
        placeListRef.current?.scrollToOffset({
          offset: Math.max(0, offset),
          animated: true,
        });
      });
    }
  };

  // Phase 2: 選択中（editing !== null）は、一覧を普通にスクロールするだけで
  // iOS のピッカー/ドラムロールのように選択が次々切り替わる（長押し＋ドラッグ
  // 案は「誰も気づかない」というフィードバックで撤回した）。「今どの行が
  // 主役か」は一覧の中央に来ている行（ドラムロールの中心と同じ。一覧の
  // 一番上に来た行を主役にする案は「先頭固定は分かりにくい」というフィード
  // バックで撤回した）。
  //
  // 中央判定だけだと、先頭/末尾に近い行は画面の中央まで持ってこられず
  // スワイプで選べなくなる（実機フィードバックで確認）。上下にパディングを
  // 足し、一覧の端までスクロールした時にその行の中央がちょうど一覧の中央に
  // 来るようにする（iOS の日付ピッカーと同じ考え方）。ヘッダー
  // （「◯件の場所」）は先頭側だけに乗るので、その分だけ上のパディングを
  // 短くする。
  const pickerCenterPad =
    editing != null ? Math.max(0, sheetViewportHeight / 2 - LIST_ROW_H / 2) : 0;
  const pickerTopPad = Math.max(0, pickerCenterPad - LIST_HEADER_H);

  // FlatList の実測可視高さが変わるたびに呼ぶ。pendingCenterIndexRef が
  // 立っている間（previewOrEditPlace 参照）は、fit→半分 detent の遷移
  // アニメーションが落ち着く（onLayout がしばらく発火しなくなる）まで
  // デバウンスしてから、その時点の実測高さで中央へ運ぶ。closure で古い
  // pickerTopPad/sheetViewportHeight を掴まないよう、このイベントの
  // height からその場で計算し直す。
  const handleListLayout = (e: LayoutChangeEvent) => {
    const height = e.nativeEvent.layout.height;
    setSheetViewportHeight(height);
    const index = pendingCenterIndexRef.current;
    if (index == null) return;
    if (pendingCenterScrollTimerRef.current) {
      clearTimeout(pendingCenterScrollTimerRef.current);
    }
    pendingCenterScrollTimerRef.current = setTimeout(() => {
      pendingCenterIndexRef.current = null;
      const centerPad = Math.max(0, height / 2 - LIST_ROW_H / 2);
      const topPad = Math.max(0, centerPad - LIST_HEADER_H);
      const offset =
        topPad + LIST_HEADER_H + (index + 0.5) * LIST_ROW_H - height / 2;
      placeListRef.current?.scrollToOffset({
        offset: Math.max(0, offset),
        animated: true,
      });
    }, 150);
  };

  // 一覧スクロールの現在位置から「今中央にある行」を求め、その場で
  // commitPreviewPlace を呼ぶ＝タップ選択と全く同じ状態（赤ピン・住所・
  // 日付/エリアバッジ・地図追従）を毎回そのまま反映する。「指を離した時に
  // 確定する」段階を別に設けない（スワイプ中に見えているものが最終結果、
  // という実機フィードバックへの対応）。onScroll は onViewableItemsChanged と
  // 違って FlatList 側の可視判定のバッチ処理を経ないので、レイアウト変化
  // （行の展開）だけでは発火せず、実際のスクロールに対して高頻度で呼ばれる
  // （scrollEventThrottle）。
  // focusProgress は reanimated の SharedValue（ref と同じ可変コンテナ）で、
  // react-hooks/immutability はまだ「別の effect の依存配列に載っている値を
  // ここで書き換える」ことと区別できないため、この関数の中だけ無効化する
  // （week-calendar.tsx の ghostPan と同じ対処）。
  /* eslint-disable react-hooks/immutability */
  const applyPickerFocus = (offsetY: number) => {
    if (editing == null) return;
    if (sheetViewportHeight <= 0 || filteredPlaces.length === 0) return;
    const centerY = offsetY + sheetViewportHeight / 2;
    const raw = (centerY - pickerTopPad - LIST_HEADER_H) / LIST_ROW_H - 0.5;
    const index = Math.round(
      Math.min(Math.max(raw, 0), filteredPlaces.length - 1),
    );
    if (index === liveFocusIndexRef.current) return;
    const from = liveFocusIndexRef.current;
    liveFocusIndexRef.current = index;
    const item = filteredPlaces[index];
    // 地図未登録の行はピッカーで選べない（タップ操作と同じ制約 —
    // previewOrEditPlace も未登録の行では呼ばれず startLocate に回る）。
    // 中央に来ても選択は直前のままにする＝地図の赤ピンと選択中の行が
    // 食い違わないようにする。
    if (!item || item.lat == null || item.lng == null) return;
    if (item.id === editing.id) return; // 変化なし
    // 「ドラムロールのように全部の行を拾う」: 一度に複数またいだ時も通過した
    // 行の数だけハプティックを鳴らす（1回だけだと速いフリックで間の行を
    // 飛ばした感触になる、という実機フィードバックへの対応）。
    const steps = from < 0 ? 1 : Math.min(Math.abs(index - from), 8);
    for (let i = 0; i < steps; i++) void Haptics.selectionAsync();
    justCommittedRef.current = true; // 下の同期 effect の二重アニメを止める
    focusProgress.value = withSpring(index, FOCUS_SPRING_CONFIG);
    commitPreviewPlace(item); // タップ選択と同じ処理（赤ピン・住所・バッジ・地図追従）
  };
  /* eslint-enable react-hooks/immutability */

  const handlePickerScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!isUserScrollingRef.current) return;
    applyPickerFocus(e.nativeEvent.contentOffset.y);
  };

  // 指を離した瞬間に慣性（惰性スクロール）が残っていれば、そのまま
  // isUserScrollingRef を true に保って、惰性で流れている間も
  // handlePickerScroll がライブ反映され続けるようにする（普通にドラッグ
  // している間と同じ動きにしたい、という実機フィードバックへの対応。
  // ここで false にしてしまうと惰性中の onScroll が全部無視され、
  // 「指を離すと止まるまで固まって、止まった瞬間に切り替わる」動きになる）。
  // 慣性が残らない（ゆっくり指を離してそのまま止まる）場合は
  // onMomentumScrollBegin/End 自体が発火しないので、ここで確定してよい。
  const handleDragEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) {
      isUserScrollingRef.current = false;
    }
    applyPickerFocus(e.nativeEvent.contentOffset.y);
  };

  // 惰性スクロールが実際に止まった瞬間の最終位置での取りこぼし防止
  // （scrollEventThrottle の間隔ぶんだけ最後の onScroll が実際の停止位置
  // より僅かに古いことがある）。同じ行への2回目の呼び出しは
  // applyPickerFocus が素通しするだけで実害はない。
  //
  // onMomentumScrollEnd はユーザーの指によるスクロールだけでなく、
  // scrollToIndex({animated:true}) のようなプログラム的な animated scroll の
  // 完了時にも native 側から発火する（iOS の
  // scrollViewDidEndScrollingAnimation 相当）。previewOrEditPlace が選択直後に
  // その行を中央へ運ぶための scrollToIndex を呼んでおり、その完了でここが
  // 発火すると、行の高さの近似値（LIST_ROW_H）と scrollToIndex 自身が使う
  // 実測/推定レイアウトの微妙なズレにより、applyPickerFocus が「中央」を
  // 隣の行と誤認して選択を上書きしてしまっていた（実機フィードバックで確認:
  // タップした行と違う行が選択された状態になる）。isUserScrollingRef が
  // true（＝実際に指でスクロールしていた）時だけ確定させる。
  const handleMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const wasUserScroll = isUserScrollingRef.current;
    isUserScrollingRef.current = false;
    if (!wasUserScroll) return;
    applyPickerFocus(e.nativeEvent.contentOffset.y);
  };

  // 検索結果一覧の行タップ・地図上の候補ピンタップの両方がここを通る:
  // previewOrEditPlace と同じ2段階（1タップ目=選択のみ・2タップ目=フォーム）
  // に揃える。検索候補は元々「探して選んだ」1タップ直行だったが、確定済み
  // 一覧と操作感が食い違う（いきなり編集/追加シートが開く）という指摘を受けて
  // 統一した。サジェスト確定（pickPrediction）・POIタップ（onPoiPress）は
  // 別入口として従来どおり1タップ直行のまま（openAddCandidate/openEditPlace）。
  const previewOrAddCandidate = (c: PlaceCandidate) => {
    const saved = findSavedByGoogleId(c.placeId);
    if (saved) {
      previewOrEditPlace(saved);
      return;
    }
    if (selectedCandidate?.placeId === c.placeId) {
      setFormOpen(true); // 2タップ目: 追加
      return;
    }
    setSelectedCandidate(c);
    setEditing(null);
    closeSuggestions();
    focusCoord(c.lat, c.lng);
    setListOpen(true);
  };

  // 地図未登録の場所の「位置を指定」モードを開始（web の startLocate と同じ）:
  // 他の選択状態をクリアして地図に集中させ、一覧シートを閉じる（地図をタップ
  // できるようにするため）。
  const startLocate = (p: PlaceRow) => {
    setEditing(null);
    setSelectedCandidate(null);
    setPinDraft(null);
    setLocating({ id: p.id, name: p.name });
    setListOpen(false);
    Keyboard.dismiss();
    closeSuggestions();
  };

  // 「位置を指定」モード中の地図タップ/長押し: 赤ピンを立てて確定を確認し、
  // set_place_location RPC で座標を設定する（web の LocateInfo の確定と同じ）。
  const pickLocation = (lat: number, lng: number) => {
    if (!locating) return;
    setPinDraft({ lat, lng });
    Alert.alert(
      t("setLocation"),
      t("settingLocationFor", { name: locating.name }),
      [
        {
          text: "キャンセル",
          style: "cancel",
          onPress: () => setPinDraft(null),
        },
        {
          text: tCommon("confirm"),
          onPress: () => {
            void setPlaceLocation(supabase, locating.id, lat, lng).then(
              (r) => {
                setPinDraft(null);
                if (!r.ok) {
                  Alert.alert(r.error);
                  return;
                }
                setLocating(null);
                void invalidate();
              },
            );
          },
        },
      ],
    );
  };

  // 一覧シートの表示モード（検索結果 or 通常一覧）。ボタン/検索で開く方式なので
  // 開いた時は中段（detent 1）から見せる。展開すると全画面一覧。
  const listMode = candidates.length > 0 ? "search" : "browse";

  // 一覧シートの上限＝検索バーの下端が隠れない高さまで（実機フィードバック:
  // 場所が多いと「中身にフィット」がどこまでも伸びて検索バーを覆ってしまう
  // ため、画面高からの一律計算ではなく検索バーの実測位置を上限にする）。
  // 実測が届く前（初回フレーム）は従来どおり画面高−上部インセットに
  // フォールバックする。
  //
  // **referenceHeight（iOS の maximumDetentValue 相当）と capHeight
  // （見せたい上限）は別物として扱う。** RNS は比率 detent を
  // `context.maximumDetentValue * fraction` で px に戻すため、分母を
  // capHeight にすり替えると比率1.0が「検索バー下端」でなく「画面いっぱい」
  // に解決されてしまい、上限が効かなくなる（実機で発生した実バグ）。
  const SHEET_TOP_GAP = 12; // 検索バーとシートの間に残す隙間
  const referenceHeight = windowHeight - stableInsetsTop;
  const maxSheetHeight =
    searchBarBottomY > 0
      ? Math.min(
          referenceHeight,
          Math.max(100, windowHeight - searchBarBottomY - SHEET_TOP_GAP),
        )
      : referenceHeight;

  // 通常一覧（browse）の detent。開いた瞬間は小さい方（画面の半分程度）で
  // 見せ、下から引き上げると検索バーの下端までを上限に拡張できる
  // （以前は逆＝既定が「中身にフィット」で、場所が多いとほぼ全画面になって
  // しまっていた。実機フィードバックで撤回）。
  // 計算（比率への変換・昇順・(0,1] の保証）は shared の純粋関数側。
  // 半分の段は「半分にしてもヘッダー＋1行は見える」大きさのときだけ足す。
  const browseSheet = fitAndHalfDetents({
    // 実測（FlatList の contentSize）が届くまでは概算で組む。実測が来たら
    // そちらに差し替わる＝「中身にフィット」は実測が単一の真実。
    contentHeight: browseContentH ?? estimateListContentH(filteredPlaces),
    capHeight: maxSheetHeight,
    referenceHeight,
    minHalfHeight: LIST_HEADER_H + LIST_ROW_H,
  });

  return (
    <ScreenStack style={StyleSheet.absoluteFill}>
      {/* ベース画面: 地図＋検索バー＋位置指定バナー。常設リストと追加/編集
          フォームはこの上に native の formSheet として重ねる。
          sheetLargestUndimmedDetentIndex="last" で全 detent で背後の地図が
          暗くならず操作できる（本家 Apple/Google マップの場所カードと同じ）。
          @gorhom の BottomSheet/FormSheet を react-native-screens の
          ScreenStack/ScreenStackItem に置換。単一コンポーネントのままなので
          mapRef・state・ハンドラは従来どおり共有できる（共有ストア不要）。 */}
      <ScreenStackItem
        screenId="places-map"
        activityState={2}
        style={StyleSheet.absoluteFill}
        // header を hidden にしないと iOS26 の ScreenStackItem が中身を
        // SafeAreaView(top) で包み、地図の上に黒帯（上部インセット）が出る。
        // 全画面地図なので上部インセットは不要＝hidden で opt-out する。
        headerConfig={{ hidden: true }}
      >
        <View style={styles.screen}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        customMapStyle={theme.dark ? DARK_MAP_STYLE : undefined}
        // ダブルタップズームを切る代わりにシングルタップの認識遅延を大幅に
        // 減らす（react-native-maps 公式ドキュメントの注記どおり）。地図タップで
        // 場所一覧シートを閉じた直後、もう一度タップ/スワイプしても地図が
        // 反応しない不具合の原因がこれだった＝iOS の Google Maps SDK は
        // シングルタップをダブルタップの1打目と区別するため毎回のタップに
        // 判定待ちを挟んでおり、閉じた直後の2回目の操作がその判定待ちに
        // 飲まれていた。ピンチズームは影響を受けない。
        zoomTapEnabled={false}
        // 現在地の青丸は自前の Marker で描く（下の <Marker> 参照。native の
        // showsUserLocation は重なり順を制御できないため使わない）。
        // 縮尺バーは「拡大縮小を始めた瞬間」から出す（本家 Google マップと
        // 同じ）ので、ジェスチャ中に連続発火する onRegionChange 側で判定する。
        // 候補ラベルの再配置は重い計算なので従来どおり onRegionChangeComplete
        // （ジェスチャ確定時）だけで行い、ここでは触らない。
        onRegionChange={onRegionChange}
        onRegionChangeComplete={onRegionChangeComplete}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setMapSize({ width, height });
        }}
        // 地図の素のタップ＝入力から離れた合図。キーボードとサジェストを畳む
        // （本家と同じ）。マーカータップは各マーカーの onPress が受ける。
        // 「位置を指定」モード中はタップ座標をその場所の位置として確定に回す
        // （web の locatingHint「クリック / 長押し」と同じく両ジェスチャ対応）。
        // 何もない場所のタップ（ドラッグ/ピンチでは発火しない＝react-native-maps
        // が move 系ジェスチャと区別済み）は選択解除＝本家マップの「キャンセル」
        // と同じ動き。段階的に一段戻す:
        //   - 編集/追加フォームを開いている（2タップ目まで進んだ・候補/長押し）→
        //     フォームを閉じて選択も全部解除する。
        //   - 一覧の1タップ目（プレビュー・赤ピン）だけの状態 → 選択だけ解除し、
        //     一覧シートは開いたままにする（一覧を見ている続きの操作を
        //     邪魔しないようにする）。
        //   - 一覧シートを開いているだけ（選択なし）→ 一覧を閉じる
        //     （スワイプ閉じの onDismissed と同じ後始末）。
        onPress={(e) => {
          Keyboard.dismiss();
          closeSuggestions();
          if (locating) {
            const c = e.nativeEvent.coordinate;
            pickLocation(c.latitude, c.longitude);
            return;
          }
          if (formOpen) {
            setFormOpen(false);
            setSelectedCandidate(null);
            setEditing(null);
            setPinDraft(null);
          } else if (editing) {
            setEditing(null);
          } else if (listOpen) {
            setListOpen(false);
            setCandidates([]);
            setSelectedCandidate(null);
          }
        }}
        onLongPress={(e) => {
          const c = e.nativeEvent.coordinate;
          if (locating) {
            pickLocation(c.latitude, c.longitude);
            return;
          }
          onMapLongPress(c.latitude, c.longitude);
        }}
        onPoiClick={(e) =>
          void onPoiPress(e.nativeEvent.placeId, e.nativeEvent.coordinate)
        }
      >
        {filteredPlaces
          .filter((p) => p.lat != null && p.lng != null)
          .map((p) => {
            // 編集中（フォームを開いている）のピンは本家 Google マップと同じく
            // 赤ピンに差し替えて表示する。シートを閉じると元のピンに戻る。
            const isEditing = editing?.id === p.id;
            return (
              <Marker
                // 差し替えで子とアンカーが変わるので key で再マウントさせる。
                key={`${p.id}:${isEditing ? 1 : 0}`}
                coordinate={{ latitude: p.lat!, longitude: p.lng! }}
                onPress={() => {
                  // 地図から選んだ＝一覧側もその行までスクロールして見せる。
                  scrollToSelectionRef.current = true;
                  previewOrEditPlace(p);
                }}
                // stopPropagation の既定は false（react-native-maps）＝
                // マーカーの onPress は親 MapView の onPress にもバブリング
                // する。iOS はこれが有効で、放っておくと同じタップで直後に
                // 地図側の onPress も発火し「選択した直後に選択解除される
                // （editing/listOpen を戻す分岐）」不具合になる＝地図上の
                // ピンを直タップした時だけ一覧の行タップと挙動が食い違って
                // 見えていた原因。
                stopPropagation
                // 丸マーカーは中心、赤ピンは先端を座標に合わせる。
                anchor={
                  isEditing ? { x: 0.5, y: 0.9 } : { x: 0.5, y: 0.5 }
                }
                // 現在地の青丸（下の MyLocationDot マーカー）より手前に確定
                // ピンが乗って隠してしまわないよう、通常時は負の zIndex で
                // 青丸の下に沈める（編集中の赤ピンは操作対象なので手前のまま）。
                zIndex={isEditing ? 200 : -1}
              >
                {isEditing ? (
                  <RedPin />
                ) : (
                  <PlaceMarker
                    icon={p.icon}
                    tentative={p.tentative}
                    creatorHue={
                      memberHueById.get(p.created_by_member_id) ?? null
                    }
                  />
                )}
              </Marker>
            );
          })}
        {/* 現在地の青丸。確定ピン(zIndex=-1)より手前・編集中の赤ピン(200)より
            奥に固定し、常に確定ピンに隠れず見える位置にする。 */}
        {myLocation && (
          <Marker
            coordinate={myLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={50}
            tracksViewChanges={false}
          >
            <MyLocationDot />
          </Marker>
        )}
        {pinDraft && (
          <Marker
            coordinate={{ latitude: pinDraft.lat, longitude: pinDraft.lng }}
            anchor={{ x: 0.5, y: 0.9 }}
          >
            <RedPin />
          </Marker>
        )}
        {candidates.map((c) => {
          const placement = labelPlacements[c.placeId] ?? "right";
          const selected = c.placeId === selectedCandidate?.placeId;
          return (
            <CandidateMarker
              // 見た目が変わる要素を key に含めて再マウントさせる
              // （tracksViewChanges を切った後の再描画手段）。
              key={`${c.placeId}:${placement}:${selected ? 1 : 0}:${theme.dark ? 1 : 0}`}
              candidate={c}
              placement={placement}
              selected={selected}
              dark={theme.dark}
              onPress={() => {
                // 地図から選んだ＝一覧側もその行までスクロールして見せる。
                scrollToSelectionRef.current = true;
                previewOrAddCandidate(c);
              }}
            />
          );
        })}
      </MapView>

      {/* 「位置を指定」モード中のヒント帯（amber。web の locating 行と同じ意味） */}
      {locating && (
        <View style={styles.locatingBanner}>
          <Text style={styles.locatingText} numberOfLines={2}>
            {t("setLocation")} {t("settingLocationFor", { name: locating.name })}
            {": "}
            {t("locatingHintTouch")}
          </Text>
          <Pressable
            onPress={() => {
              setLocating(null);
              setPinDraft(null);
            }}
            hitSlop={8}
            accessibilityLabel={t("cancelLocate")}
          >
            <XIcon size={16} color={theme.warnAccent} />
          </Pressable>
        </View>
      )}

      {/* 検索バー（地図上に重ねる）＋入力中サジェスト。
          専用の検索ボタンは置かない（本家 Google マップと同じくソフトウェア
          キーボードの確定キー＝ returnKeyType="search" だけで検索する。
          web の Combobox と違い、候補は矢印キーでなくタップで選ぶので
          「確定キー＝ハイライト中候補の確定」の曖昧さが無く、ボタンが要らない）。 */}
      <View
        ref={searchBarRef}
        style={styles.searchBar}
        onLayout={() => {
          // 検索バー自身の absolute 位置（top: 12 等）はこの View の親基準
          // なので、画面座標での下端は measureInWindow で実測する。
          searchBarRef.current?.measureInWindow((_x, y, _w, h) => {
            setSearchBarBottomY(y + h);
          });
        }}
      >
        <View style={styles.searchInputWrap}>
          <TextInput
            value={query}
            onChangeText={onQueryChange}
            placeholder={t("searchPlaceholder")}
            placeholderTextColor={theme.subtleForeground}
            style={styles.searchInput}
            returnKeyType="search"
            onSubmitEditing={() => void runSearch()}
            editable={!!PLACES_API_KEY}
          />
          {/* 右端は状態排他で1つだけ: 検索中はスピナー、そうでなく入力があれば
              全消しの ×（本家 Google マップと同じく入力欄の右端に出る）。
              入力欄は wrap の先頭なので絶対配置でその上に重ねる（サジェストが
              下に伸びても位置は変わらない）。 */}
          {searching ? (
            <View style={styles.searchClear} pointerEvents="none">
              <ActivityIndicator size="small" color={theme.mutedForeground} />
            </View>
          ) : (
            query.length > 0 && (
              <Pressable
                onPress={clearSearch}
                hitSlop={8}
                style={styles.searchClear}
                accessibilityLabel={t("searchClear")}
              >
                <XIcon size={18} color={theme.mutedForeground} />
              </Pressable>
            )
          )}
          {predictions.length > 0 && (
            <View style={styles.suggestions}>
              {predictions.map((p) => (
                <Pressable
                  key={p.placeId}
                  onPress={() => void pickPrediction(p)}
                  style={styles.suggestionRow}
                >
                  <Text style={styles.suggestionPrimary} numberOfLines={1}>
                    {p.primaryText}
                  </Text>
                  {p.secondaryText ? (
                    <Text
                      style={styles.suggestionSecondary}
                      numberOfLines={1}
                    >
                      {p.secondaryText}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>

          {/* 場所フィルタ（エリア/日にちで地図のピン・一覧を絞り込む）。検索
              バーの右隣（右上）に置く＝多くのアプリでフィルタが右上にある
              慣例に合わせる。検索バー側を右に少し詰めて隙間を作る
              （styles.searchBar の right 参照）。フィルタ中はアイコンを
              塗り＋青地にして常に一目で分かるようにする（フィルタしっぱなし
              で忘れるのを防ぐ、との要望）。 */}
          {!locating && (
            <Pressable
              onPress={() => setFilterOpen(true)}
              style={[
                styles.filterButtonTop,
                placeFilter && styles.filterButtonActive,
              ]}
              accessibilityLabel={
                placeFilter
                  ? t("filterAria", { label: placeFilterLabel(placeFilter) })
                  : t("filterTitle")
              }
            >
              <FilterIcon size={18} color={placeFilter ? "#fff" : theme.foreground} />
            </Pressable>
          )}

          {/* 一覧を開くボタン（タブバーの上に浮かせる）。常設シートをやめ、
              押した時だけ native の formSheet で一覧を出す＝閉じている間は
              タブバーが見える。中身は native の摺りガラス（UIVisualEffectView
              ラップの GlassView。isInteractive でタップ時に native のガラスの
              光り方をする）＝自前 backgroundColor で透明感を偽装しない。 */}
          {!locating && (
            <Pressable
              onPress={() => setListOpen(true)}
              style={styles.listButtonWrap}
              accessibilityLabel="場所一覧を開く"
            >
              <GlassView
                glassEffectStyle="regular"
                isInteractive
                style={styles.listButton}
              >
                <ChevronIcon size={16} color={theme.foreground} rotate={-90} />
                <Text style={styles.listButtonText}>
                  {filteredPlaces.length}件の場所
                </Text>
              </GlassView>
            </Pressable>
          )}

          {/* 縮尺バー（本家 Google マップの右下と同じ）。ズームした時だけ
              フェードインし、約5秒後にフェードアウトする。地図キャンバスの
              上に直接乗るので、候補ピンのラベルと同じ「地図の見た目に合わせた
              色＋ハロー」で明暗どちらのベースマップでも読める（ui-guidelines
              の地図・Google 連携の原則）。 */}
          {scaleBar && (
            <Animated.View
              pointerEvents="none"
              style={[styles.scaleBar, { opacity: scaleOpacity }]}
            >
              <Text style={styles.scaleBarText}>
                {scaleBar.unit === "km"
                  ? `${scaleBar.value} km`
                  : `${scaleBar.value} m`}
              </Text>
              <View
                style={[styles.scaleBarRuler, { width: scaleBar.widthPx }]}
              />
            </Animated.View>
          )}

          {/* 方位磁針（本家 Google マップ・iOS マップと同じ: 真北を向いている
              間は隠れ、回転すると現れる）。針は地図の回転と逆に回して常に
              真北を指し続ける。タップで真北へ戻す。現在地ボタンの真上に置く。 */}
          {!locating && Math.abs(heading) > 0.5 && (
            <Pressable
              onPress={resetHeading}
              style={styles.compassButton}
              accessibilityLabel="地図の向きを北にリセット"
            >
              <Svg
                viewBox="0 0 24 24"
                width={28}
                height={28}
                style={{ transform: [{ rotate: `${-heading}deg` }] }}
              >
                <Path d="M12,2 L15,12 L9,12 Z" fill="#EA4335" />
                <Path d="M12,22 L15,12 L9,12 Z" fill={theme.mutedForeground} />
              </Svg>
            </Pressable>
          )}

          {/* 現在地に戻るボタン（本家 Google マップ・iOS マップと同じ位置・
              見た目: 白丸＋右上向きのナビゲーション矢印）。現在地を中心に
              据えている間だけ青塗り、それ以外はアウトラインのみ（本家と同じ）。
              青丸自体は上の MyLocationDot マーカーが描く。 */}
          {!locating && (
            <Pressable
              onPress={() => void goToMyLocation()}
              style={styles.myLocationButton}
              accessibilityLabel="現在地に戻る"
            >
              <Svg
                viewBox="0 -960 960 960"
                width={26}
                height={26}
                style={{
                  // Material Symbols "navigation" のグリフは viewBox 内で
                  // 視覚重心が左下に寄っており、45°回転すると白丸内で
                  // 左下ズレとして現れる。回転後のスクリーン座標系で補正する
                  // ため translate は rotate より前（＝配列内で先）に置く。
                  // シミュレータの実測(x-2.8pt/y+2.8pt)をそのまま当てると
                  // 実機では右上に寄りすぎたため、半分の値にしている。
                  transform: [
                    { translateX: 1.5 },
                    { translateY: -1.5 },
                    { rotate: "45deg" },
                  ],
                }}
              >
                {/* アウトラインは専用の Material Symbols パス（ウェイト違い）
                    ではなく、塗りと同じ NAVIGATION_ICON_FILLED_PATH を
                    stroke 描画で縁取るだけにする。ウェイト違いのパスは
                    シルエット自体のサイズ/比率が変わり、塗り⇄アウトライン
                    切替時に大きさが揃わず不自然だった（実機フィードバック）。
                    strokeWidth だけを太さの調整点にする。 */}
                <Path
                  d={NAVIGATION_ICON_FILLED_PATH}
                  fill={followingLocation ? "#4285F4" : "none"}
                  stroke={followingLocation ? undefined : theme.foreground}
                  strokeWidth={followingLocation ? undefined : 66}
                  strokeLinejoin="round"
                />
              </Svg>
            </Pressable>
          )}

        </View>
      </ScreenStackItem>

      {/* 場所一覧（native formSheet・ボタン/検索で開く・×/スワイプで閉じる）。
          常設にすると formSheet がタブバー（浮島）を覆ってタブ移動できなくなる
          ため、開いた時だけ出すモーダルにする。開いている間は地図の上に重なる
          （sheetLargestUndimmedDetentIndex="last" で地図は暗くならず操作可能）。
          開いた瞬間は小さい方（画面の半分程度）、引き上げると検索バーの下端
          までの2 detent でドラッグ。 */}
      {listOpen && (
      <ScreenStackItem
        key={`places-list-${listMode}`}
        screenId="places-list"
        activityState={2}
        stackPresentation="formSheet"
        // 通常の一覧（browse）は開いた瞬間は小さい方（画面の半分程度）で見せ、
        // 引き上げると検索バーの下端を上限に拡張できる（本家 Apple マップと
        // 同じ「まず控えめに、必要なら広げる」振る舞い。以前は逆に「中身に
        // フィット」が既定で、場所が多いとほぼ全画面になり検索バーまで隠れて
        // いた。実機フィードバックで撤回。上限の算出は上の maxSheetHeight
        // 参照）。検索結果（search）は件数が多くなりがちで、同じ理由で半分
        // 程度の高さを既定にし、地図と一覧を同時に見られるようにする
        // （本家 Google マップの検索結果シートと同じ）。
        // どちらも「小さい方」＋「大きい方」の2段で、ドラッグで切り替え
        // られるようにする（browse 側の値は上の browseSheet 参照）。
        // 行を選択している間（editing !== null）は半分の detent だけに絞る。
        // 一覧より地図が主役という方針で、選択中は地図を隠しすぎないよう
        // それ以上シートを引き上げられなくする（sheetAllowedDetents の動的
        // 変更は remount 無しで反映される・実機/シミュレータで確認済み）。
        sheetAllowedDetents={
          listMode === "search"
            ? [0.25, 0.5]
            : editing
              ? [browseSheet.detents[0]]
              : browseSheet.detents
        }
        sheetInitialDetentIndex={
          listMode === "search"
            ? 1
            : editing
              ? 0
              : 0 // browse も開いた瞬間は小さい方（画面の半分程度）から見せる
        }
        sheetLargestUndimmedDetentIndex="last"
        // 内側 FlatList のスクロールとシート拡張を分離しないと、行タップが
        // 「スクロールで拡張」ジェスチャに飲まれて onPress が発火しない。
        sheetExpandsWhenScrolledToEdge={false}
        sheetGrabberVisible
        // sheetCornerRadius は指定しない（native 既定 = automatic）。固定値
        // （旧16pt）だと iOS26 の大きな continuous コーナー＋左右の浮きマージンと
        // 半径が噛み合わず、カーブ部分だけ本家と違う小さい丸みに見えていた。
        // automatic にすると OS がマージン幅とコーナー半径を一致させて計算し、
        // 本家 Apple マップの場所シートと同じ「全周同じ幅の隙間」になる。
        headerConfig={{ hidden: true }}
        // 背景色は敷かず native 既定のシートマテリアル（摺りガラス）に任せる＝
        // 他の formSheet と同じ質感。地図の上でも背後をぼかして読みやすい
        // （本家 Apple マップの場所シートと同じ）。
        // スワイプ閉じで一覧を閉じる（× は付けない＝native シートはドラッグで
        // 閉じる）。検索結果は破棄し、プレビュー選択（赤ピン）も解除する。
        onDismissed={() => {
          setListOpen(false);
          setCandidates([]);
          setEditing(null);
          setSelectedCandidate(null);
        }}
      >
        {candidates.length > 0 ? (
          // 検索結果モード: searchText で取得済みの候補情報を一覧で見せる
          // （表示は取得済みデータの描画だけ＝追加の API 課金なし）。
          // ヘッダーは ListHeaderComponent に入れる＝native formSheet の
          // ScrollView 検出（最大2サブビュー）を壊さないよう、FlatList を
          // ScreenStackItem 直下の単一の子にする（さもないと行タップが
          // シートのスクロール/拡張ジェスチャに飲まれて発火しない）。
          <FlatList
            ref={candidateListRef}
            data={candidates}
            keyExtractor={(item) => item.placeId}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            // 行の高さを実測前に scrollToIndex した場合の保険（FlatList の
            // 推奨手順）: 平均行高でおおよその位置へ飛ばし、実測が済む次の
            // フレームで正確に合わせ直す。
            onScrollToIndexFailed={({ index, averageItemLength }) => {
              candidateListRef.current?.scrollToOffset({
                offset: index * averageItemLength,
                animated: false,
              });
              setTimeout(() => {
                candidateListRef.current?.scrollToIndex({
                  index,
                  viewPosition: 0,
                });
              }, 50);
            }}
            // selectedCandidate が変わったら行を再レンダー（選択ハイライトと、
            // 行 onPress のクロージャを最新の選択状態で作り直すため。保存済み
            // 一覧の extraData と同じ理由＝無いと2タップ目の判定が古いままになる）。
            extraData={selectedCandidate?.placeId ?? ""}
            ListHeaderComponent={
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetCount}>
                  検索結果 {candidates.length}件
                </Text>
              </View>
            }
            renderItem={({ item }) => (
                <Pressable
                  onPress={() => previewOrAddCandidate(item)}
                  style={[
                    styles.placeRow,
                    // 選択中（プレビュー中）の行を薄くハイライト（保存済み一覧と同じ）。
                    selectedCandidate?.placeId === item.placeId &&
                      styles.selectedRow,
                  ]}
                >
                  {/* 行の先頭グリフ＝地図の候補ピンと同じカテゴリアイコン（Google 赤） */}
                  <PlaceCategoryIcon
                    icon={iconKeyForGoogleType(item.primaryType)}
                    size={20}
                    color="#EA4335"
                  />
                  <View style={styles.placeInfo}>
                    <Text style={styles.placeName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={styles.candidateMeta}>
                      {item.rating != null && (
                        <>
                          <Svg viewBox="0 -960 960 960" width={12} height={12}>
                            <Path d={STAR_PATH} fill="#d97706" />
                          </Svg>
                          <Text style={styles.candidateRating}>
                            {item.rating.toFixed(1)}
                          </Text>
                          {item.userRatingCount != null && (
                            <Text style={styles.candidateCount}>
                              ({item.userRatingCount})
                            </Text>
                          )}
                        </>
                      )}
                      <Text
                        style={styles.candidateAddress}
                        numberOfLines={1}
                      >
                        {item.formattedAddress}
                      </Text>
                    </View>
                  </View>
                  {/* プレビュー中（1タップ目）の行だけ、もう1タップで追加に
                      進むことを示す「＞」（保存済み一覧と同じ）。 */}
                  {selectedCandidate?.placeId === item.placeId && (
                    <ChevronIcon size={16} color={theme.mutedForeground} />
                  )}
                </Pressable>
            )}
          />
        ) : (
          <FlatList
            ref={placeListRef}
            data={filteredPlaces}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: LIST_BOTTOM_PADDING + pickerCenterPad },
            ]}
            keyboardShouldPersistTaps="handled"
            // 中身の高さ＝シートの「フィット」detent の元になる値（上の
            // browseSheet 参照）。行の増減・note の折返しまで込みの実測値。
            onContentSizeChange={(_w, h) => setBrowseContentH(h)}
            // Phase 2: 選択中の一覧スクロールをピッカー操作にするための実測
            // 可視高さ（handlePickerScroll・上のパディング計算で使う）。
            // タップ選択直後は fit→半分 detent の遷移が落ち着くまで、この
            // 実測を使って中央へのスクロールをデバウンスする（詳細は
            // handleListLayout 参照）。
            onLayout={handleListLayout}
            // scrollToIndex の保険（検索結果側と同じ。理由はそちらのコメント）。
            onScrollToIndexFailed={({ index, averageItemLength }) => {
              placeListRef.current?.scrollToOffset({
                offset: index * averageItemLength,
                animated: false,
              });
              setTimeout(() => {
                placeListRef.current?.scrollToIndex({
                  index,
                  viewPosition: 0,
                });
              }, 50);
            }}
            // editing / locating が変わったら行を再レンダー（選択ハイライトと、
            // 行 onPress のクロージャを最新の editing で作り直すため。無いと
            // 2タップ目の判定が古い editing=null のままになる）。
            extraData={`${editing?.id ?? ""}:${locating?.id ?? ""}`}
            onScroll={handlePickerScroll}
            scrollEventThrottle={16}
            onScrollBeginDrag={() => {
              isUserScrollingRef.current = true;
            }}
            onScrollEndDrag={handleDragEnd}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            ListHeaderComponent={
              <>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetCount}>
                    {filteredPlaces.length}件の場所
                  </Text>
                </View>
                {/* ピッカー中の先頭/末尾の行を一覧の中央まで持ってこられる
                    ようにする余白。ヘッダーの後ろに置くことで、ヘッダー
                    自体はスクロール位置に関わらず常に一覧の先頭に留まる
                    （余白がヘッダーの上に付くと、選択中だけヘッダーが下に
                    ずれて見えてしまうため）。 */}
                {pickerTopPad > 0 && <View style={{ height: pickerTopPad }} />}
              </>
            }
            renderItem={({ item, index }) => (
              <SavedPlaceRow
                item={item}
                index={index}
                isSelected={editing?.id === item.id}
                isLocating={item.lat == null && item.id === locating?.id}
                day={dayByPlaceId.get(item.id)}
                area={areaByPlaceId.get(item.id)}
                focusProgress={focusProgress}
                focusActive={focusActive}
                theme={theme}
                styles={styles}
                t={t}
                onStartLocate={() => startLocate(item)}
                onCancelLocate={() => {
                  setLocating(null);
                  setPinDraft(null);
                }}
                onPreviewOrEdit={() => previewOrEditPlace(item)}
              />
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>まだ場所がありません。</Text>
            }
          />
        )}
      </ScreenStackItem>
      )}

      {/* 追加/編集フォーム＝一覧の上にさらに重ねる native formSheet。
          sheetLargestUndimmedDetentIndex="last" で背後の地図（どのピンの話かの
          文脈・仮ピン位置）を暗くせず見せる。本家 Google/Apple マップの場所
          カードと同じ。キーボード回避は native の formSheet が自動で行う
          （@gorhom 時代の keyboardBehavior="extend" 相当の手当ては不要）。 */}
      {formOpen && (
        <ScreenStackItem
          screenId="places-form"
          activityState={2}
          stackPresentation="formSheet"
          sheetAllowedDetents="fitToContents"
          sheetLargestUndimmedDetentIndex="last"
          sheetGrabberVisible
          // sheetCornerRadius は指定しない（native 既定 = automatic。理由は
          // 一覧シートと同じ、下のコメント参照）。
          headerConfig={{ hidden: true }}
          // 背景色は敷かず native 既定のシートマテリアルに任せる（他の
          // formSheet と同じ質感）。
          // スワイプ閉じ・プログラム閉じ両方で地図の一時表示を解除する:
          // 候補ピンの選択ハイライト・編集中ピンの赤ピン差し替え・長押しの仮ピン。
          onDismissed={() => {
            setFormOpen(false);
            setSelectedCandidate(null);
            setEditing(null);
            setPinDraft(null);
          }}
        >
          <ScrollView
            contentContainerStyle={styles.formScroll}
            keyboardShouldPersistTaps="handled"
          >
            <PlaceForm
              tripId={tripId}
              pinOptions={pinOptions}
              candidate={selectedCandidate ?? undefined}
              pinDraft={pinDraft ?? undefined}
              editPlace={editing ?? undefined}
              myMemberId={me.id}
              invalidate={invalidate}
              onDone={() => {
                setFormOpen(false);
                setCandidates([]);
                setQuery("");
                setPredictions([]);
                setPinDraft(null);
                setSelectedCandidate(null);
                setEditing(null);
                void invalidate();
              }}
            />
          </ScrollView>
        </ScreenStackItem>
      )}
      {/* 場所フィルタの選択肢（エリア/日にち）。一覧/編集フォームと同じ native
          formSheet にする＝グラバー位置・摺りガラス質感がその2つと揃う
          （実機フィードバック: 以前使っていた @gorhom の FormSheet は透明感が
          無く、ヘッダー上余白も他と食い違って見えていた）。 */}
      {filterOpen && (
        <ScreenStackItem
          screenId="places-filter"
          activityState={2}
          stackPresentation="formSheet"
          sheetAllowedDetents="fitToContents"
          sheetGrabberVisible
          headerConfig={{ hidden: true }}
          onDismissed={() => setFilterOpen(false)}
        >
          <ScrollView contentContainerStyle={styles.formScroll}>
            <SheetTitle>{t("filterTitle")}</SheetTitle>
            <Pressable
              onPress={() => applyPlaceFilter(null)}
              style={[styles.priorityRow, !placeFilter && styles.priorityRowSelected]}
            >
              <Text
                style={[
                  styles.priorityRowLabel,
                  !placeFilter && styles.priorityRowLabelSelected,
                ]}
              >
                {t("filterAll")}
              </Text>
              {!placeFilter && (
                <CheckIcon size={16} color={theme.mutedForeground} />
              )}
            </Pressable>
            {areaFilterOptions.length > 0 && (
              <>
                <Text style={styles.filterSectionLabel}>
                  {t("filterSectionArea")}
                </Text>
                {areaFilterOptions.map(([label, count]) => {
                  const selected =
                    placeFilter?.kind === "area" && placeFilter.label === label;
                  return (
                    <Pressable
                      key={`area:${label ?? ""}`}
                      onPress={() => applyPlaceFilter({ kind: "area", label })}
                      style={[styles.priorityRow, selected && styles.priorityRowSelected]}
                    >
                      <Text
                        style={[
                          styles.priorityRowLabel,
                          selected && styles.priorityRowLabelSelected,
                        ]}
                      >
                        {label ?? t("other")}
                      </Text>
                      <Text style={styles.filterCount}>{count}</Text>
                      {selected && (
                        <CheckIcon size={16} color={theme.mutedForeground} />
                      )}
                    </Pressable>
                  );
                })}
              </>
            )}
            {dayFilterOptions.length > 0 && (
              <>
                <Text style={styles.filterSectionLabel}>
                  {t("filterSectionDay")}
                </Text>
                {dayFilterOptions.map((d) => {
                  const selected =
                    placeFilter?.kind === "day" &&
                    placeFilter.dayIndex === d.dayIndex;
                  return (
                    <Pressable
                      key={`day:${d.dayIndex}`}
                      onPress={() =>
                        applyPlaceFilter({ kind: "day", dayIndex: d.dayIndex })
                      }
                      style={[styles.priorityRow, selected && styles.priorityRowSelected]}
                    >
                      <Text
                        style={[
                          styles.priorityRowLabel,
                          selected && styles.priorityRowLabelSelected,
                        ]}
                      >
                        {`${d.dayIndex}日目・${formatDayLabel(d.date)}`}
                      </Text>
                      <Text style={styles.filterCount}>{d.count}</Text>
                      {selected && (
                        <CheckIcon size={16} color={theme.mutedForeground} />
                      )}
                    </Pressable>
                  );
                })}
              </>
            )}
          </ScrollView>
        </ScreenStackItem>
      )}
    </ScreenStack>
  );
}

// 検索候補のマーカー（本家 Google マップの検索結果ピンと同形＝ピル＋店名
// ラベル。選択中は配色反転）。placement は親が layoutLabels で衝突回避済みに
// 決めた位置。
// コンテナの形と anchor は shared の markerGeometry（衝突計算と単一の真実）。
// tracksViewChanges は初回描画後に切って CPU を抑える。見た目が変わるとき
// （placement / selected / ダーク切替）は親が key を変えて再マウントする。
function CandidateMarker({
  candidate: c,
  placement,
  selected,
  dark,
  onPress,
}: {
  candidate: PlaceCandidate;
  placement: LabelPlacement;
  selected: boolean;
  dark: boolean;
  onPress: () => void;
}) {
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setTracks(false), 400);
    return () => clearTimeout(id);
  }, []);

  const pin = candidatePinSize(c.rating);
  const label = estimateLabelBox(c.name, CANDIDATE_LABEL);
  const g = markerGeometry(placement, pin, label, CANDIDATE_LABEL_GAP);
  return (
    <Marker
      coordinate={{ latitude: c.lat, longitude: c.lng }}
      anchor={{ x: g.anchorX, y: g.anchorY }}
      onPress={onPress}
      // stopPropagation の既定は false（react-native-maps）＝マーカーの
      // onPress は親 MapView の onPress にもバブリングする。iOS はこれが
      // 有効で、放っておくと同じタップで直後に地図側の onPress も発火し
      // 「選択した直後に選択解除される（listOpen を戻す/candidates を
      // 消す分岐）」という不具合になる＝直タップで一覧行と違って
      // 1タップ目の選択が反映されないように見えていた原因。
      stopPropagation
      zIndex={selected ? 100 : 10}
      tracksViewChanges={tracks}
    >
      <View style={{ width: g.width, height: g.height }}>
        <View style={{ position: "absolute", left: g.pinX, top: g.pinY }}>
          <CandidatePin
            icon={iconKeyForGoogleType(c.primaryType)}
            rating={c.rating}
            selected={selected}
            dark={dark}
          />
        </View>
        {placement !== "hidden" && g.labelX != null && g.labelY != null && (
          <Text
            numberOfLines={label.lines}
            style={{
              position: "absolute",
              left: g.labelX,
              top: g.labelY,
              width: label.width,
              fontSize: CANDIDATE_LABEL.fontSize,
              lineHeight: CANDIDATE_LABEL.lineHeight,
              fontWeight: "500",
              textAlign:
                placement === "left"
                  ? "right"
                  : placement === "right"
                    ? "left"
                    : "center",
              // 地図ラベルと同じハロー付き文字（ライト=濃字+白縁、ダーク=白字+
              // 夜間スタイルの地色縁）。ベースマップの地名より一段目立たせる。
              color: dark ? "#ffffff" : "#202124",
              textShadowColor: dark ? "#242f3e" : "#ffffff",
              textShadowRadius: 2,
              textShadowOffset: { width: 0, height: 0 },
            }}
          >
            {c.name}
          </Text>
        )}
      </View>
    </Marker>
  );
}

// Google 公式サンプルの夜間スタイル（ダーク時のベースマップ。web は Map の
// colorScheme に任せるが、react-native-maps の Google provider は JSON 指定）。
const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#263c3f" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b9a76" }],
  },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#212a37" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9ca5b3" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#746855" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1f2835" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#f3d19c" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#2f3948" }],
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#515c6d" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#17263c" }],
  },
];

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  screen: { flex: 1 },
  searchBar: {
    position: "absolute",
    top: 12,
    left: 12,
    // 右はフィルタボタン（44幅 + 隙間12）ぶん詰める。
    right: 68,
  },
  // 入力欄とサジェストを縦に重ねる器。
  searchInputWrap: {
    flex: 1,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  searchInput: {
    height: 44,
    borderRadius: 8,
    backgroundColor: t.background,
    paddingHorizontal: 14,
    // 右端の × のぶんを空けて、入力文字が × の下に潜らないようにする。
    paddingRight: 38,
    fontSize: 15,
    color: t.foreground,
  },
  // 入力欄（高さ 44・wrap の先頭）の右端に重ねる全消しボタン。
  searchClear: {
    position: "absolute",
    right: 10,
    top: 0,
    height: 44,
    justifyContent: "center",
  },
  // 入力直下のサジェスト（レイヤーとサイズは ui-guidelines のドロップダウン規約:
  // rounded-md 相当・max-h-64・shadow）。
  suggestions: {
    marginTop: 6,
    maxHeight: 256,
    borderRadius: 8,
    backgroundColor: t.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.fgAlpha(0.1),
    overflow: "hidden",
  },
  suggestionRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.fgAlpha(0.08),
  },
  suggestionPrimary: { fontSize: 15, color: t.foreground },
  suggestionSecondary: {
    fontSize: 12,
    color: t.mutedForeground,
    marginTop: 2,
  },
  // 一覧を開く浮遊ボタン。タブバー（浮島）の上に出す＝bottom はタブバー高より
  // 十分上に取る（予定/費用タブの FAB と同じ考え方）。位置＋影は外側の
  // Pressable（listButtonWrap）が持つ＝GlassView 側で角丸クリップすると影まで
  // 切れるため分ける。
  listButtonWrap: {
    position: "absolute",
    alignSelf: "center",
    bottom: 100,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  listButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  listButtonText: { fontSize: 14, fontWeight: "500", color: t.foreground },
  // 現在地に戻るボタン。位置は一覧ボタンと同じ高さで右端（本家 Google
  // マップの右下コントロール群と同じ並び）。
  myLocationButton: {
    position: "absolute",
    right: 12,
    bottom: 100,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: t.background,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  // 場所フィルタ。検索バーと同じ高さで右上（多くのアプリの慣例に合わせる）。
  filterButtonTop: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: t.background,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  // フィルタ中は塗り＝アクティブ表示（followingLocation の青と同じ配色）。
  filterButtonActive: { backgroundColor: "#4285F4" },
  // 方位磁針。現在地ボタンの真上（本家 Google マップ・iOS マップと同じ並び）。
  compassButton: {
    position: "absolute",
    right: 12,
    bottom: 152,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: t.background,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  // 縮尺バー。右側は現在地ボタン・方位磁針の縦列なので、本家 Google マップと
  // 同じく左下に置く。ダーク地図でも読めるよう、候補ピンのラベルと同じ
  // 「ハロー付き文字」。
  scaleBar: {
    position: "absolute",
    left: 12,
    bottom: 100,
    alignItems: "flex-start",
  },
  scaleBarText: {
    fontSize: 11,
    fontWeight: "500",
    marginBottom: 2,
    color: t.dark ? "#ffffff" : "#202124",
    textShadowColor: t.dark ? "#242f3e" : "#ffffff",
    textShadowRadius: 2,
    textShadowOffset: { width: 0, height: 0 },
  },
  scaleBarRuler: {
    height: 7,
    borderBottomWidth: 1.5,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: t.dark ? "#e8eaed" : "#3c4043",
  },
  formScroll: { paddingBottom: 24 },
  // 上に grabber（取っ手）があるので paddingTop で件数表記を下げて被りを防ぐ。
  sheetHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    alignItems: "center",
  },
  sheetCount: { fontSize: 13, color: t.mutedForeground },
  // 場所フィルタの選択行。todos.tsx の優先度ピッカーと同形（行の骨格）。
  priorityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.fgAlpha(0.08),
  },
  // 選択中はチェックマークだけだと目立たなかったため、web の
  // メニュー/ドロップダウンの選択行と同じ bg-accent 相当（このアプリの
  // secondary は web の --accent と同値）＋太字を行全体に効かせる
  // （このアプリに native の「選択行」精度は無いので、web の既存の選択行
  // 表現に合わせるのが「合わせる」の対象。ui-guidelines「定型部品」参照）。
  priorityRowSelected: { backgroundColor: t.secondary },
  priorityRowLabel: { flex: 1, fontSize: 15, color: t.foreground },
  priorityRowLabelSelected: { fontWeight: "600" },
  filterSectionLabel: {
    fontSize: 12,
    color: t.subtleForeground,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  filterCount: { fontSize: 13, color: t.subtleForeground },
  // 検索候補行の2行目: ★評価 + 住所（web の place-popups と同じ並び）。
  candidateMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  candidateRating: { fontSize: 12, color: "#d97706" },
  candidateCount: { fontSize: 12, color: t.mutedForeground },
  candidateAddress: {
    flex: 1,
    fontSize: 12,
    color: t.mutedForeground,
    marginLeft: 3,
  },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  placeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.fgAlpha(0.08),
  },
  placeInfo: { flex: 1 },
  placeNameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  placeName: { fontSize: 15, color: t.foreground, flexShrink: 1 },
  // 「地図未登録」バッジ（amber 塗りチップ。web の bg-amber-100 text-amber-700 相当）。
  unmappedBadge: {
    borderRadius: 4,
    backgroundColor: t.warnChipBg,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  unmappedBadgeText: { fontSize: 11, color: t.warnAccent },
  // 位置指定モード中の行（amber の面＋左の縦棒。web の locating 行と同じ）。
  locatingRow: {
    backgroundColor: t.warnBg,
    borderLeftWidth: 4,
    borderLeftColor: "#fbbf24",
  },
  // プレビュー中（1タップ目で選択）の行の縦の余白（住所/バッジが増える分も
  // 含めて「その場で膨らんだカード」に見せる。LayoutAnimation で高さ変化を
  // 自動補間）。背景ハイライト・他行の薄さは rowFocusStyle（連続値）が担当
  // するのでここには置かない。
  selectedRow: { paddingVertical: 14 },
  placeNameSelected: { fontWeight: "600" },
  placeAddress: { fontSize: 12, color: t.mutedForeground, marginTop: 2 },
  placeBadgeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  // 日付バッジ＝一番伝えたい情報なので強調（bg-secondary + foreground の塗り
  // チップ）。エリアはその補足なのでチップにせず控えめなテキストのみ。
  dayBadge: {
    borderRadius: 4,
    backgroundColor: t.secondary,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  dayBadgeText: { fontSize: 11, color: t.foreground, fontWeight: "600" },
  areaBadgeText: { fontSize: 11, color: t.mutedForeground },
  setPinLabel: { fontSize: 12, color: "#2563eb" },
  cancelLocateLabel: { fontSize: 12, color: t.warnAccent },
  // 位置指定モードのヒント帯（検索バーの下に重ねる）。
  locatingBanner: {
    position: "absolute",
    top: 64,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: t.warnBorder,
    backgroundColor: t.warnBg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  locatingText: { flex: 1, fontSize: 12, color: t.warnText },
  placeMeta: { fontSize: 12, color: t.mutedForeground, marginTop: 2 },
  empty: { padding: 24, fontSize: 14, color: t.mutedForeground },
});
