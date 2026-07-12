import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { useMemo, useRef, useState } from "react";
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
  type MapMarker,
  type Region,
} from "react-native-maps";
import { useTranslations } from "use-intl";

import { boundsOf, centroid, TOKYO } from "@triplot/shared/placeMap";
import { getIconLabel } from "@triplot/shared/placeIcons";
import {
  autocompletePlaces,
  fetchPlaceDetails,
  searchPlaces,
  type PlaceCandidate,
  type PlacePrediction,
} from "@triplot/shared/placesSearch";
import { derivePlaces, type PlaceRow } from "@triplot/shared/tripDerive";

import Svg, { Path } from "react-native-svg";

import { FormSheet, type FormSheetRef } from "@/components/form-sheet";
import { PlaceCategoryIcon } from "@/components/place-category-icon";
import { PlaceForm } from "@/components/place-form";
import { PlaceMarker, RedPin } from "@/components/place-marker";
import { SearchIcon, XIcon } from "@/components/icons";
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

// 場所タブ（RN・M5）: Google 地図 + 保存済みピン + 検索 + ドラッグ式ボトムシート
// 一覧 + 追加/編集。web の PlacesSection 相当。地図は PROVIDER_GOOGLE で世界観統一。
export default function PlacesTab() {
  const tripId = useTripId();
  const t = useTranslations("place");
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { data, me } = useTripDetail(tripId);
  const invalidate = useInvalidateTrip(tripId);

  const mapRef = useRef<MapView>(null);
  const formRef = useRef<FormSheetRef>(null);
  const listSheetRef = useRef<BottomSheet>(null);
  const markerRefs = useRef(new Map<string, MapMarker | null>());

  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  // 入力中サジェスト（web の検索窓ドロップダウンと同じ）。debounce + 課金
  // 最適化のセッショントークン。
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] =
    useState<PlaceCandidate | null>(null);
  const [editing, setEditing] = useState<PlaceRow | null>(null);
  // 地図長押しで置いた仮ピン（web の draft ピンと同じ。保存/閉じで消す）。
  const [pinDraft, setPinDraft] = useState<{ lat: number; lng: number } | null>(
    null,
  );

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

  if (!data?.trip || !me) return null;

  const pinKeys = (data.pinOptionsRaw ?? []).map((p) => p.icon);
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

  // 入力ごとにサジェストを引く（web と同じ 300ms debounce）。1 セッションの
  // 課金トークンを維持し、確定（details）で消費する。
  const onQueryChange = (v: string) => {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!PLACES_API_KEY || !v.trim()) {
      setPredictions([]);
      return;
    }
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = newSessionToken();
    }
    debounceRef.current = setTimeout(() => {
      void autocompletePlaces(v, {
        apiKey: PLACES_API_KEY,
        iosBundleId: BUNDLE_ID,
        biasCenter: biasCenter(),
        sessionToken: sessionTokenRef.current ?? undefined,
      })
        .then(setPredictions)
        .catch(() => setPredictions([]));
    }, 300);
  };

  // サジェスト確定: details で座標・住所を補完し、候補ピンを立てて保存フォームへ
  // （web の pick → fetchFields と同じ。session トークンをここで消費）。
  const pickPrediction = async (p: PlacePrediction) => {
    if (!PLACES_API_KEY) return;
    // 候補を選んだら入力は終わり＝キーボードを畳む（地図とフォームを見せる）。
    Keyboard.dismiss();
    setPredictions([]);
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
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPredictions([]);
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

  // 座標を「フォームシートに隠れない画面上寄り（上から約25%）」に置くカメラ
  // 移動。中央に置くと下から出るフォームシートとちょうど重なる。ピンタップ時は
  // Google SDK 既定の「ピンを中央へ」アニメーションと競合するので、フォームを
  // 開く各経路で必ずこれを呼び、最後に発行したこの移動で確定させる。
  const focusCoord = (lat: number, lng: number) => {
    const latDelta = 0.02;
    mapRef.current?.animateToRegion({
      latitude: lat - latDelta * 0.25,
      longitude: lng,
      latitudeDelta: latDelta,
      longitudeDelta: latDelta,
    });
  };

  const openAddCandidate = (c: PlaceCandidate) => {
    setSelectedCandidate(c);
    setEditing(null);
    setPinDraft(null);
    setPredictions([]);
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
    collapseListSheet();
    focusCoord(lat, lng);
    formRef.current?.present();
  };

  // ベースマップの POI（Google の店・施設アイコン）タップ: Place Details で
  // 住所・region を補完して、検索候補と同じ保存フォームを開く（web の POI
  // タップ→追加と同じ入口）。
  const onPoiPress = async (placeId: string) => {
    if (!PLACES_API_KEY) return;
    try {
      const c = await fetchPlaceDetails(placeId, {
        apiKey: PLACES_API_KEY,
        iosBundleId: BUNDLE_ID,
      });
      if (c) openAddCandidate(c);
    } catch (e) {
      Alert.alert(t("searchFailed"), String(e));
    }
  };
  // 保存済みの場所を開く（一覧行タップ・ピンの吹き出しタップの両方から）:
  // 地図でそのピンへ寄せる＋編集シートを出すハイブリッド。一覧シートは畳む。
  const openEditPlace = (p: PlaceRow) => {
    setEditing(p);
    setSelectedCandidate(null);
    collapseListSheet();
    if (p.lat != null && p.lng != null) {
      focusCoord(p.lat, p.lng);
      // 寄せた後に吹き出し（場所名）を出して、どのピンの編集中か分かるようにする。
      setTimeout(() => markerRefs.current.get(p.id)?.showCallout(), 400);
    }
    formRef.current?.present();
  };

  // ピンのタップに地図の寄りで応える（どの場所を選んだかのフィードバック）。
  const focusPlacePin = (p: PlaceRow) => {
    if (p.lat == null || p.lng == null) return;
    focusCoord(p.lat, p.lng);
  };

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        customMapStyle={theme.dark ? DARK_MAP_STYLE : undefined}
        onLongPress={(e) => {
          const c = e.nativeEvent.coordinate;
          onMapLongPress(c.latitude, c.longitude);
        }}
        onPoiClick={(e) => void onPoiPress(e.nativeEvent.placeId)}
      >
        {places
          .filter((p) => p.lat != null && p.lng != null)
          .map((p) => (
            <Marker
              key={p.id}
              ref={(r) => {
                markerRefs.current.set(p.id, r);
              }}
              coordinate={{ latitude: p.lat!, longitude: p.lng! }}
              title={p.name}
              onPress={() => focusPlacePin(p)}
              onCalloutPress={() => openEditPlace(p)}
              // 丸マーカーは中心を座標に合わせる（雫ピンと違い先端が無い）。
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <PlaceMarker
                icon={p.icon}
                tentative={p.tentative}
                creatorHue={memberHueById.get(p.created_by_member_id) ?? null}
              />
            </Marker>
          ))}
        {pinDraft && (
          <Marker
            coordinate={{ latitude: pinDraft.lat, longitude: pinDraft.lng }}
            anchor={{ x: 0.5, y: 0.9 }}
          >
            <RedPin />
          </Marker>
        )}
        {candidates.map((c) => (
          <Marker
            key={c.placeId}
            coordinate={{ latitude: c.lat, longitude: c.lng }}
            onPress={() => openAddCandidate(c)}
            // 雫の先端は viewBox 下端より 10% 上（y=-100/960）にある。
            anchor={{ x: 0.5, y: 0.9 }}
          >
            <RedPin />
          </Marker>
        ))}
      </MapView>

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
                  {/* 行の先頭グリフ＝地図の候補ピンと同じ Google 赤の雫 */}
                  <PlaceCategoryIcon icon="pin" size={20} color="#EA4335" />
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
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => openEditPlace(item)}
                  style={styles.placeRow}
                >
                  <PlaceCategoryIcon
                    icon={item.icon}
                    size={20}
                    color={item.tentative ? "#f59e0b" : "#10b981"}
                  />
                  <View style={styles.placeInfo}>
                    <Text style={styles.placeName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.placeMeta}>
                      {item.tentative
                        ? t("statusCandidate")
                        : t("statusConfirmed")}
                      {" ・ "}
                      {getIconLabel(item.icon)}
                    </Text>
                  </View>
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={styles.empty}>まだ場所がありません。</Text>
              }
            />
          </>
        )}
      </BottomSheet>

      {/* 追加/編集フォーム。地図タブだけ中身の高さちょうどまで＝全開だと
          どのピンの話か（地図の文脈）が見えなくなるため。予定・費用のフォームは
          従来どおり全開（sizeToContent を渡していない）。 */}
      <FormSheet ref={formRef} sizeToContent>
        {(dismiss) => (
          <PlaceForm
            tripId={tripId}
            pinKeys={pinKeys}
            candidate={selectedCandidate ?? undefined}
            pinDraft={pinDraft ?? undefined}
            editPlace={editing ?? undefined}
            myMemberId={me.id}
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
  placeName: { fontSize: 15, color: t.foreground },
  placeMeta: { fontSize: 12, color: t.mutedForeground, marginTop: 2 },
  empty: { padding: 24, fontSize: 14, color: t.mutedForeground },
});
