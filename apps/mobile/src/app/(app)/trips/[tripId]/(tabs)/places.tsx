import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  searchPlaces,
  type PlaceCandidate,
} from "@triplot/shared/placesSearch";
import { derivePlaces, type PlaceRow } from "@triplot/shared/tripDerive";

import { FormSheet, type FormSheetRef } from "@/components/form-sheet";
import { PlaceCategoryIcon } from "@/components/place-category-icon";
import { PlaceForm } from "@/components/place-form";
import { PlaceMarker, RedPin } from "@/components/place-marker";
import { SearchIcon } from "@/components/icons";
import { useInvalidateTrip, useTripDetail } from "@/lib/useTripDetail";
import { useTripId } from "@/lib/useTripId";

const PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
const BUNDLE_ID = "app.triplot.mobile";

// 場所タブ（RN・M5）: Google 地図 + 保存済みピン + 検索 + ドラッグ式ボトムシート
// 一覧 + 追加/編集。web の PlacesSection 相当。地図は PROVIDER_GOOGLE で世界観統一。
export default function PlacesTab() {
  const tripId = useTripId();
  const t = useTranslations("place");
  const { data, me } = useTripDetail(tripId);
  const invalidate = useInvalidateTrip(tripId);

  const mapRef = useRef<MapView>(null);
  const formRef = useRef<FormSheetRef>(null);
  const listSheetRef = useRef<BottomSheet>(null);
  const markerRefs = useRef(new Map<string, MapMarker | null>());

  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCandidate, setSelectedCandidate] =
    useState<PlaceCandidate | null>(null);
  const [editing, setEditing] = useState<PlaceRow | null>(null);

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

  const runSearch = async () => {
    if (!PLACES_API_KEY || !query.trim()) return;
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
      }
    } catch {
      setCandidates([]);
    } finally {
      setSearching(false);
    }
  };

  const openAddCandidate = (c: PlaceCandidate) => {
    setSelectedCandidate(c);
    setEditing(null);
    formRef.current?.present();
  };
  const openEditPlace = (p: PlaceRow) => {
    setEditing(p);
    setSelectedCandidate(null);
    formRef.current?.present();
  };

  // 一覧から場所を選択: web のタブ表示と同じく、シートを畳んで地図でその場所の
  // ピンを見せる（編集フォームは開かない。編集はピン/行の操作から）。
  // 未マップの場所はピンが無いので従来どおり編集フォームへ。
  const showPlaceOnMap = (p: PlaceRow) => {
    if (p.lat == null || p.lng == null) {
      openEditPlace(p);
      return;
    }
    listSheetRef.current?.snapToIndex(0);
    mapRef.current?.animateToRegion({
      latitude: p.lat,
      longitude: p.lng,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    });
    // アニメーション後に吹き出し（場所名）を出して、どのピンか分かるようにする。
    setTimeout(() => markerRefs.current.get(p.id)?.showCallout(), 400);
  };

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
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
              onCalloutPress={() => openEditPlace(p)}
              anchor={{ x: 0.5, y: 1 }}
            >
              <PlaceMarker icon={p.icon} tentative={p.tentative} />
            </Marker>
          ))}
        {candidates.map((c) => (
          <Marker
            key={c.placeId}
            coordinate={{ latitude: c.lat, longitude: c.lng }}
            onPress={() => openAddCandidate(c)}
            anchor={{ x: 0.5, y: 1 }}
          >
            <RedPin />
          </Marker>
        ))}
      </MapView>

      {/* 検索バー（地図上に重ねる） */}
      <View style={styles.searchBar}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("searchPlaceholder")}
          placeholderTextColor="rgba(0,0,0,0.38)"
          style={styles.searchInput}
          returnKeyType="search"
          onSubmitEditing={() => void runSearch()}
          editable={!!PLACES_API_KEY}
        />
        <Pressable
          onPress={() => void runSearch()}
          style={styles.searchButton}
          accessibilityLabel={t("searchAria")}
        >
          {searching ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <SearchIcon size={18} color="#fff" />
          )}
        </Pressable>
      </View>

      {/* 場所一覧（ドラッグ式ボトムシート） */}
      <BottomSheet ref={listSheetRef} index={0} snapPoints={["12%", "45%", "88%"]}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetCount}>{places.length}件の場所</Text>
        </View>
        <BottomSheetFlatList
          data={places}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => showPlaceOnMap(item)}
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
      </BottomSheet>

      {/* 追加/編集フォーム */}
      <FormSheet ref={formRef}>
        {(dismiss) => (
          <PlaceForm
            tripId={tripId}
            pinKeys={pinKeys}
            candidate={selectedCandidate ?? undefined}
            editPlace={editing ?? undefined}
            myMemberId={me.id}
            onDone={() => {
              dismiss();
              setCandidates([]);
              setQuery("");
              void invalidate();
            }}
          />
        )}
      </FormSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  searchBar: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    fontSize: 15,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#09090b",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetHeader: { paddingHorizontal: 16, paddingBottom: 8, alignItems: "center" },
  sheetCount: { fontSize: 13, color: "rgba(0,0,0,0.55)" },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  placeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  placeInfo: { flex: 1 },
  placeName: { fontSize: 15 },
  placeMeta: { fontSize: 12, color: "rgba(0,0,0,0.55)", marginTop: 2 },
  empty: { padding: 24, fontSize: 14, color: "rgba(0,0,0,0.6)" },
});
