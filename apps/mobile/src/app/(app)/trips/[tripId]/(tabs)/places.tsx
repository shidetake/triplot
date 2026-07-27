import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { GlassView } from "expo-glass-effect";
import * as Location from "expo-location";
import { ScreenStack, ScreenStackItem } from "react-native-screens";
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  type Details,
  type Region,
} from "react-native-maps";
import { useTranslations } from "use-intl";

import { boundsOf, centroid, TOKYO } from "@triplot/shared/placeMap";
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
import { derivePlaces, type PlaceRow } from "@triplot/shared/tripDerive";

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
import { ChevronIcon, LockIcon, SearchIcon, XIcon } from "@/components/icons";
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
// アウトラインのみにする（塗り=fill1・アウトライン=既定/fill0 の2バリアント）。
// 地図・Google 連携のビジュアルは Google に合わせる（ui-guidelines）。
const NAVIGATION_ICON_FILLED_PATH =
  "M480-240 222-130q-13 5-24.5 2.5T178-138q-8-8-10.5-20t2.5-25l273-615q5-12 15.5-18t21.5-6q11 0 21.5 6t15.5 18l273 615q5 13 2.5 25T782-138q-8 8-19.5 10.5T738-130L480-240Z";
const NAVIGATION_ICON_OUTLINE_PATH =
  "M480-240 222-130q-13 5-24.5 2.5T178-138q-8-8-10.5-20t2.5-25l273-615q5-12 15.5-18t21.5-6q11 0 21.5 6t15.5 18l273 615q5 13 2.5 25T782-138q-8 8-19.5 10.5T738-130L480-240Zm-196-4 196-84 196 84-196-440-196 440Zm196-84Z";

// Places autocomplete のセッショントークン（課金束ね用）。render 中には
// 呼ばない（イベントハンドラから使う）。
function newSessionToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// 候補ピンの店名ラベルの文字設定（衝突計算の箱見積もりと描画で共有）。
const CANDIDATE_LABEL = { fontSize: 13, lineHeight: 16, maxWidth: 130 };
// ピンとラベルの間隔（px）。
const CANDIDATE_LABEL_GAP = 4;

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

  const mapRef = useRef<MapView>(null);
  // シートの開閉。どちらも native の formSheet（モーダル）で、開いた時だけ
  // 出す＝閉じている間は地図とタブバーが見える。常設にすると formSheet が
  // タブバー（浮島）を覆ってタブ移動できなくなるため、ボタンで開く方式にする。
  //   listOpen: 場所一覧（下の「一覧」ボタン / 検索実行で開く）
  //   formOpen: 追加/編集フォーム（候補・ピン・保存済みピンから開く）
  const [listOpen, setListOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

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

  const places = useMemo(
    () => (data ? derivePlaces(data.placesRaw) : []),
    [data],
  );

  // 初期リージョン: 既存ピンの範囲/重心、無ければ東京。
  const initialRegion: Region = useMemo(() => {
    const coords = places
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => ({ lat: p.lat as number, lng: p.lng as number }));
    const b = boundsOf(coords);
    if (b) {
      return {
        latitude: (b.north + b.south) / 2,
        longitude: (b.east + b.west) / 2,
        latitudeDelta: Math.max(0.05, (b.north - b.south) * 1.5),
        longitudeDelta: Math.max(0.05, (b.east - b.west) * 1.5),
      };
    }
    const c = centroid(coords) ?? TOKYO;
    return {
      latitude: c.lat,
      longitude: c.lng,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
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

  if (!data?.trip || !me) return null;

  const pinOptions = (data.pinOptionsRaw ?? []) as PinOption[];
  // 未確定ピンの色 = 作成者のメンバー hue（web の place-map と同じ）。
  const memberHueById = new Map(
    (data.members ?? []).map((m) => [m.id, m.color]),
  );

  const biasCenter = () =>
    centroid(
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

  const runSearch = async () => {
    if (!PLACES_API_KEY || !query.trim()) return;
    // 検索実行＝入力は終わり。キーボードと入力中サジェストを畳んで
    // 地図（候補ピン）と結果一覧を見せる。
    Keyboard.dismiss();
    closeSuggestions();
    setSearching(true);
    try {
      const bias = centroid(
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

  // ピン選択時のカメラ移動は本家 Google マップと同じ「ズームは一切変えず
  // パンだけ」。狙い位置は「フォームシートに隠れない画面上寄り（上から約25%）」
  // （中央に置くと下から出るフォームシートとちょうど重なる）。既にほぼ狙い
  // 位置にあるピンは動かさない — 判定は本家同様厳しめ（画面の各軸10%以内）で、
  // 少しでも端にあれば寄せる。ピンタップ時は Google SDK 既定の「ピンを中央へ」
  // アニメーションと競合するので、フォームを開く各経路で必ずこれを呼び、
  // 動かさない場合も現在中心への移動を発行して SDK 既定の移動を打ち消す。
  const focusCoord = (lat: number, lng: number) => {
    // region は onRegionChangeComplete（ジェスチャ/アニメーション確定時）でしか
    // 更新されないため、検索直後のように前のカメラアニメーションがまだ収まって
    // いない間に呼ばれると古い region を基準にしてしまい、計算した中心が大きく
    // ずれて地図が予期しない位置へ飛ぶ不具合があった（候補ピンの直タップで発覚）。
    // ジェスチャ中も連続発火する onRegionChange 側の scaleRegion の方が新しいので
    // 優先して使う。
    const r = scaleRegion ?? region ?? initialRegion;
    // ピンを画面の上から25%に置く＝中心はピンより latDelta の 1/4 南。
    const center = { latitude: lat - r.latitudeDelta * 0.25, longitude: lng };
    const dx = Math.abs(center.longitude - r.longitude) / r.longitudeDelta;
    const dy = Math.abs(center.latitude - r.latitude) / r.latitudeDelta;
    const nearTarget = dx < 0.1 && dy < 0.1;
    mapRef.current?.animateCamera({
      center: nearTarget
        ? { latitude: r.latitude, longitude: r.longitude }
        : center,
    });
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
    setEditing(p);
    setSelectedCandidate(null);
    closeSuggestions();
    if (p.lat != null && p.lng != null) focusCoord(p.lat, p.lng);
    setFormOpen(true);
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
    setSelectedCandidate(null);
    setEditing(p); // 選択（赤ピン）
    closeSuggestions();
    if (p.lat != null && p.lng != null) focusCoord(p.lat, p.lng); // 地図を寄せる
    setListOpen(true); // 地図のピンタップからも一覧を見せる（一覧はすでに開いていれば変化なし）
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
        {places
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
                onPress={() => previewOrEditPlace(p)}
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
              onPress={() => previewOrAddCandidate(c)}
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

      {/* 検索バー（地図上に重ねる）＋入力中サジェスト */}
      <View style={styles.searchBar}>
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
        <Pressable
          onPress={() => void runSearch()}
          style={styles.searchButton}
          accessibilityLabel={t("searchAria")}
        >
          {searching ? (
            <ActivityIndicator size="small" color={theme.primaryForeground} />
          ) : (
            <SearchIcon size={18} color={theme.primaryForeground} />
          )}
        </Pressable>
      </View>

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
                <Text style={styles.listButtonText}>{places.length}件の場所</Text>
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
                width={20}
                height={20}
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
                width={20}
                height={20}
                style={{ transform: [{ rotate: "45deg" }] }}
              >
                <Path
                  d={
                    followingLocation
                      ? NAVIGATION_ICON_FILLED_PATH
                      : NAVIGATION_ICON_OUTLINE_PATH
                  }
                  fill={followingLocation ? "#4285F4" : theme.foreground}
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
          中段(0.45)〜全画面(0.88)の 2 detent でドラッグ。 */}
      {listOpen && (
      <ScreenStackItem
        key={`places-list-${listMode}`}
        screenId="places-list"
        activityState={2}
        stackPresentation="formSheet"
        // 通常の一覧（browse）は中身の高さにフィット（本家 Apple マップと同じ）。
        // 固定 detent だと場所が少ない時にリスト下に大きな空きが出るのを防ぐ。
        // 検索結果（search）は件数が多くなりがちで fitToContents だと画面の
        // 上限まで伸びて地図が見えなくなる（実機フィードバック）ので、
        // 半分程度の高さを既定にし、地図と一覧を同時に見られるようにする
        // （本家 Google マップの検索結果シートと同じ）。もう1段階小さい
        // detent も足し、ドラッグで地図をさらに広く見せられるようにする
        // （既定のサイズは変えない＝sheetInitialDetentIndex で明示）。
        sheetAllowedDetents={
          listMode === "search" ? [0.25, 0.5] : "fitToContents"
        }
        sheetInitialDetentIndex={listMode === "search" ? 1 : undefined}
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
            data={candidates}
            keyExtractor={(item) => item.placeId}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
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
            data={places}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            // editing / locating が変わったら行を再レンダー（選択ハイライトと、
            // 行 onPress のクロージャを最新の editing で作り直すため。無いと
            // 2タップ目の判定が古い editing=null のままになる）。
            extraData={`${editing?.id ?? ""}:${locating?.id ?? ""}`}
            ListHeaderComponent={
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetCount}>{places.length}件の場所</Text>
              </View>
            }
            renderItem={({ item }) => {
                const unmapped = item.lat == null;
                const isLocating = unmapped && item.id === locating?.id;
                return (
                  <Pressable
                    onPress={() =>
                      isLocating
                        ? (setLocating(null), setPinDraft(null))
                        : unmapped
                          ? startLocate(item)
                          : previewOrEditPlace(item)
                    }
                    style={[
                      styles.placeRow,
                      isLocating && styles.locatingRow,
                      // 選択中（プレビュー中）の行を薄くハイライト（bg-accent 相当）。
                      editing?.id === item.id && styles.selectedRow,
                    ]}
                  >
                    <PlaceCategoryIcon
                      icon={item.icon}
                      size={20}
                      color={item.tentative ? "#f59e0b" : "#10b981"}
                    />
                    <View style={styles.placeInfo}>
                      <View style={styles.placeNameRow}>
                        <Text style={styles.placeName} numberOfLines={1}>
                          {item.name}
                        </Text>
                        {item.visibility === "private" && (
                          <LockIcon size={16} color={theme.mutedForeground} />
                        )}
                        {unmapped && (
                          <View style={styles.unmappedBadge}>
                            <Text style={styles.unmappedBadgeText}>
                              {t("unmapped")}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.placeMeta}>
                        {item.tentative
                          ? t("statusCandidate")
                          : t("statusConfirmed")}
                        {" ・ "}
                        {getIconLabel(item.icon)}
                      </Text>
                      {item.note ? (
                        <Text style={styles.placeMeta} numberOfLines={2}>
                          {item.note}
                        </Text>
                      ) : null}
                    </View>
                    {unmapped ? (
                      <Text
                        style={
                          isLocating
                            ? styles.cancelLocateLabel
                            : styles.setPinLabel
                        }
                      >
                        {isLocating ? t("cancelLocate") : t("setPin")}
                      </Text>
                    ) : (
                      // プレビュー中（1タップ目・赤ピン選択）の行だけ、iOS標準の
                      // 「＞」ディスクロージャ表示を出す＝もう1タップで編集に進む
                      // ことを示す（本家 iOS リストの慣例と同じ見た目で表現）。
                      editing?.id === item.id && (
                        <ChevronIcon size={16} color={theme.mutedForeground} />
                      )
                    )}
                  </Pressable>
                );
              }}
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
    right: 12,
    flexDirection: "row",
    gap: 8,
  },
  // 入力欄とサジェストを縦に重ねる器（検索ボタンとは横並び）。
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
    fontSize: 15,
    color: t.foreground,
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
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: t.primary,
    alignItems: "center",
    justifyContent: "center",
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
  // プレビュー中（1タップ目で選択）の行のハイライト（選択状態＝bg-accent 相当）。
  selectedRow: { backgroundColor: t.fgAlpha(0.06) },
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
