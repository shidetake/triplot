import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
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

import { FormSheet, type FormSheetRef } from "@/components/form-sheet";
import { PlaceCategoryIcon } from "@/components/place-category-icon";
import { PlaceForm } from "@/components/place-form";
import {
  CandidatePin,
  candidatePinSize,
  PlaceMarker,
  RedPin,
} from "@/components/place-marker";
import { LockIcon, SearchIcon, XIcon } from "@/components/icons";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
import { useInvalidateTrip, useTripDetail } from "@/lib/useTripDetail";
import { useTripId } from "@/lib/useTripId";

const PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
const BUNDLE_ID = "app.triplot.mobile";

// Google 評価の★（web の place-popups と同じ Material Symbols star 塗り・amber）。
// 地図・Google 連携のビジュアルは Google に合わせる（ui-guidelines）。
const STAR_PATH =
  "m233-120 65-281L80-590l288-25 112-265 112 265 288 25-218 189 65 281-247-149-247 149Z";

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
  const formRef = useRef<FormSheetRef>(null);
  const listSheetRef = useRef<BottomSheet>(null);

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
        // 一覧シートを中段まで開いて検索結果のリストを見せる
        // （searchText の応答に全候補の情報が揃っている＝追加 API 呼び出しなし）。
        listSheetRef.current?.snapToIndex(1);
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

  // フォームシートを開く前の共通処理: 一覧シートを最小へ畳む（フォームの
  // 後ろに完全に隠れる＝シートの二枚重ねを見せない）。
  const collapseListSheet = () => listSheetRef.current?.snapToIndex(0);

  // ピン選択時のカメラ移動は本家 Google マップと同じ「ズームは一切変えず
  // パンだけ」。狙い位置は「フォームシートに隠れない画面上寄り（上から約25%）」
  // （中央に置くと下から出るフォームシートとちょうど重なる）。既にほぼ狙い
  // 位置にあるピンは動かさない — 判定は本家同様厳しめ（画面の各軸10%以内）で、
  // 少しでも端にあれば寄せる。ピンタップ時は Google SDK 既定の「ピンを中央へ」
  // アニメーションと競合するので、フォームを開く各経路で必ずこれを呼び、
  // 動かさない場合も現在中心への移動を発行して SDK 既定の移動を打ち消す。
  const focusCoord = (lat: number, lng: number) => {
    const r = region ?? initialRegion;
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
    collapseListSheet();
    focusCoord(c.lat, c.lng);
    formRef.current?.present();
  };

  // 地図長押し: その座標に仮ピンを置き、名前を入力して保存するフォームを開く
  // （web の「長押しでピンを置く → ピンを設定」と同じ）。
  const onMapLongPress = (lat: number, lng: number) => {
    setPinDraft({ lat, lng });
    setEditing(null);
    setSelectedCandidate(null);
    closeSuggestions();
    collapseListSheet();
    focusCoord(lat, lng);
    formRef.current?.present();
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
  // 保存済みの場所を開く（一覧行タップ・地図のピンタップの両方から同じ動き）:
  // そのピンへ寄せ、ピンを本家と同じ赤ピンに差し替えて編集シートを出す。
  // 場所名の吹き出しは出さない（名前はボトムシートにある。本家も出さない）。
  const openEditPlace = (p: PlaceRow) => {
    setEditing(p);
    setSelectedCandidate(null);
    closeSuggestions();
    collapseListSheet();
    if (p.lat != null && p.lng != null) focusCoord(p.lat, p.lng);
    formRef.current?.present();
  };

  // 地図未登録の場所の「位置を指定」モードを開始（web の startLocate と同じ）:
  // 他の選択状態をクリアして地図に集中させ、シートを畳む。
  const startLocate = (p: PlaceRow) => {
    setEditing(null);
    setSelectedCandidate(null);
    setPinDraft(null);
    setLocating({ id: p.id, name: p.name });
    Keyboard.dismiss();
    closeSuggestions();
    collapseListSheet();
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

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        customMapStyle={theme.dark ? DARK_MAP_STYLE : undefined}
        onRegionChangeComplete={setRegion}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setMapSize({ width, height });
        }}
        // 地図の素のタップ＝入力から離れた合図。キーボードとサジェストを畳む
        // （本家と同じ）。マーカータップは各マーカーの onPress が受ける。
        // 「位置を指定」モード中はタップ座標をその場所の位置として確定に回す
        // （web の locatingHint「クリック / 長押し」と同じく両ジェスチャ対応）。
        onPress={(e) => {
          Keyboard.dismiss();
          closeSuggestions();
          if (locating) {
            const c = e.nativeEvent.coordinate;
            pickLocation(c.latitude, c.longitude);
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
                onPress={() => openEditPlace(p)}
                // 丸マーカーは中心、赤ピンは先端を座標に合わせる。
                anchor={
                  isEditing ? { x: 0.5, y: 0.9 } : { x: 0.5, y: 0.5 }
                }
                zIndex={isEditing ? 200 : undefined}
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
              onPress={() => openAddCandidate(c)}
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

      {/* 場所一覧（ドラッグ式ボトムシート） */}
      <BottomSheet
        ref={listSheetRef}
        index={0}
        snapPoints={["12%", "45%", "88%"]}
        backgroundStyle={{ backgroundColor: theme.background }}
        handleIndicatorStyle={{ backgroundColor: theme.fgAlpha(0.2) }}
      >
        {candidates.length > 0 ? (
          // 検索結果モード: searchText で取得済みの候補情報を一覧で見せる
          // （表示は取得済みデータの描画だけ＝追加の API 課金なし）。
          <>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetCount}>
                検索結果 {candidates.length}件
              </Text>
              <Pressable
                onPress={() => setCandidates([])}
                style={styles.sheetClose}
                accessibilityLabel="検索結果を閉じる"
              >
                <XIcon size={16} color={theme.mutedForeground} />
              </Pressable>
            </View>
            <BottomSheetFlatList
              data={candidates}
              keyExtractor={(item) => item.placeId}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => openAddCandidate(item)}
                  style={styles.placeRow}
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
                </Pressable>
              )}
            />
          </>
        ) : (
          <>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetCount}>{places.length}件の場所</Text>
            </View>
            <BottomSheetFlatList
              data={places}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
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
                          : openEditPlace(item)
                    }
                    style={[styles.placeRow, isLocating && styles.locatingRow]}
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
                    {unmapped && (
                      <Text
                        style={
                          isLocating
                            ? styles.cancelLocateLabel
                            : styles.setPinLabel
                        }
                      >
                        {isLocating ? t("cancelLocate") : t("setPin")}
                      </Text>
                    )}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.empty}>まだ場所がありません。</Text>
              }
            />
          </>
        )}
      </BottomSheet>

      {/* 追加/編集フォーム。地図タブだけ中身の高さちょうどまで＝全開だと
          どのピンの話か（地図の文脈）が見えなくなるため。予定・費用のフォームは
          従来どおり全開（sizeToContent を渡していない）。
          scrim も無し（backdropOpacity 0）: 他の管理系シートと違い、この
          シートは背後の地図（どのピンの話かという文脈・仮ピンの位置）を見せる
          ことこそが存在意義。本家 Google/Apple マップの場所カードも背景の
          地図を暗くしない。 */}
      <FormSheet
        ref={formRef}
        sizeToContent
        backdropOpacity={0}
        // キーボードでシート全体を持ち上げない（持ち上げると背景の地図＝
        // どのピンの話かの文脈が丸ごと隠れて本末転倒）。シート位置は保ち、
        // フォーカス中の入力だけ FormSheet の自前スクロールで見せる。
        keyboardBehavior="extend"
        // 閉じたら（保存・スワイプ閉じとも）地図上の一時表示を全部解除する:
        // 候補ピンの選択ハイライト・編集中ピンの赤ピン差し替え・長押しの仮ピン。
        onDismiss={() => {
          setSelectedCandidate(null);
          setEditing(null);
          setPinDraft(null);
        }}
      >
        {(dismiss) => (
          <PlaceForm
            tripId={tripId}
            pinOptions={pinOptions}
            candidate={selectedCandidate ?? undefined}
            pinDraft={pinDraft ?? undefined}
            editPlace={editing ?? undefined}
            myMemberId={me.id}
            invalidate={invalidate}
            onDone={() => {
              dismiss();
              setCandidates([]);
              setQuery("");
              setPredictions([]);
              setPinDraft(null);
              void invalidate();
            }}
          />
        )}
      </FormSheet>
    </View>
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
  sheetHeader: { paddingHorizontal: 16, paddingBottom: 8, alignItems: "center" },
  sheetCount: { fontSize: 13, color: t.mutedForeground },
  // 検索結果モードの × （ヘッダー右端に重ねる。専用行は作らない）。
  sheetClose: {
    position: "absolute",
    right: 12,
    top: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
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
