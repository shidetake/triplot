"use client";

import {
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AdvancedMarker,
  InfoWindow,
  Map,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";

/** <html class> の "dark" を MutationObserver で監視し、colorScheme 文字列を返す。 */
function useMapColorScheme(): "DARK" | "LIGHT" {
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => {
      setIsDark(el.classList.contains("dark"));
    });
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark ? "DARK" : "LIGHT";
}

import {
  boundsOf,
  centerOf,
  type Cluster,
  clusterPlaces,
  dominantCluster,
  type LatLng,
  TOKYO,
} from "@triplot/shared/placeMap";

import { pastelBgColor, vividColor } from "@triplot/shared/memberColors";
import { useTranslations } from "next-intl";

import { PlaceIcon, type PlaceRow } from "./place-list";
import { type CandidatePlace, extractRegion } from "./place-search";

// タッチの長押し検出で任意地点に仮ピンを置く（iOS Safari は長押し→
// contextmenu が安定しないため自前実装）。<Map> の子として描画し、
// useMap でマップ DOM とオーバーレイ投影に触る。
//
// 同じ touch リスナで「直近にタッチがあったか」も記録する。click の
// domEvent 種別判定は iOS で当てにならない（タップの合成 click が
// MouseEvent 系で来て PC と区別できない）ので、自由ピンの click ドロップは
// 「直近に touch が無い＝マウス」のときだけにする（タッチ端末は touch を
// 出す・マウスは出さない＝確実）。
function LongPressPin({
  onLongPress,
  ignoreNextMapClick,
  recentTouchUntil,
}: {
  onLongPress: (p: LatLng) => void;
  ignoreNextMapClick: MutableRefObject<boolean>;
  recentTouchUntil: MutableRefObject<number>;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const div = map.getDiv();
    // 投影（screen px → latLng）を得るための空オーバーレイ。
    const overlay = new google.maps.OverlayView();
    overlay.onAdd = () => {};
    overlay.draw = () => {};
    overlay.onRemove = () => {};
    overlay.setMap(map);

    let timer: ReturnType<typeof setTimeout> | null = null;
    let sx = 0;
    let sy = 0;
    const clear = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    const onStart = (ev: TouchEvent) => {
      recentTouchUntil.current = performance.now() + 700;
      // 新しいジェスチャ開始。前ジェスチャで click が来ず残ったフラグを掃除。
      ignoreNextMapClick.current = false;
      if (ev.touches.length !== 1) {
        clear();
        return;
      }
      sx = ev.touches[0].clientX;
      sy = ev.touches[0].clientY;
      clear();
      timer = setTimeout(() => {
        timer = null;
        const proj = overlay.getProjection();
        if (!proj) return;
        const rect = div.getBoundingClientRect();
        const ll = proj.fromContainerPixelToLatLng(
          new google.maps.Point(sx - rect.left, sy - rect.top),
        );
        if (ll) {
          // 長押しで draft を出した。指を離した後に来る合成 click を
          // 1 回だけ確実に食う（タイミング非依存。これが無いと
          // touchend→click が "draft 上の余白タップ→閉じる" に化ける）。
          ignoreNextMapClick.current = true;
          onLongPress({ lat: ll.lat(), lng: ll.lng() });
        }
      }, 500);
    };
    const onMove = (ev: TouchEvent) => {
      if (!timer) return;
      const t = ev.touches[0];
      if (
        t &&
        (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10)
      ) {
        clear(); // pan とみなしてキャンセル
      }
    };
    const onEnd = () => {
      clear();
      recentTouchUntil.current = performance.now() + 700;
    };
    div.addEventListener("touchstart", onStart, { passive: true });
    div.addEventListener("touchmove", onMove, { passive: true });
    div.addEventListener("touchend", onEnd, { passive: true });
    div.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      clear();
      div.removeEventListener("touchstart", onStart);
      div.removeEventListener("touchmove", onMove);
      div.removeEventListener("touchend", onEnd);
      div.removeEventListener("touchcancel", onEnd);
      overlay.setMap(null);
    };
  }, [map, onLongPress, ignoreNextMapClick, recentTouchUntil]);

  return null;
}

// InfoWindow をマーカーに被せないための上方向オフセット(px)。
// 雫ピンと丸アイコンで高さが違うので 2 種類。雫は「検索候補の選択中」と
// 「自由(draft)ピン」で同じ要素なので必ず同じ値を使う（定数で一元化）。
// RedPin の translateY を動かしたら、その移動 px ぶん必ずここも同じだけ
// 動かす（隙間ができないよう連動）。-13% は -46% から +33pt = 34px の
// 約33% ≒ 11px ピンを下げたので、-47 から +11 して -36。
const INFO_OFFSET_PIN = -36; // RedPin（赤い雫）
const INFO_OFFSET_ICON = -27; // 保存済みピン / ベースマップ POI 既存アイコン

// 本家 Google の赤い雫ピン（Material location_on）。translateY で先端を
// マーカーのアンカー（＝クリック/座標点）に合わせる。値を大きく(負に)
// するほどピンは上にズレる。検索候補の選択時と自由（draft）ピンで共用。
function RedPin() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 -960 960 960"
      aria-hidden
      style={{
        transform: "translateY(-13%)",
        filter: "drop-shadow(0 1px 1px rgba(0,0,0,.35))",
      }}
    >
      <path
        d="M458.5-103.5Q448-107 440-115q-42-38-91-87.5T258-309q-42-57-70-119t-28-124q0-150 96.5-239T480-880q127 0 223.5 89T800-552q0 62-28 124t-70 119q-42 57-91 106.5T520-115q-8 8-18.5 11.5T480-100q-11 0-21.5-3.5Z"
        fill="#EA4335"
        stroke="#ffffff"
        strokeWidth="22"
      />
      <circle cx="480" cy="-560" r="92" fill="#A50E0E" />
    </svg>
  );
}

export type Selection =
  | { kind: "saved"; id: string }
  | { kind: "candidate"; placeId: string }
  // POI タップ: 既存のベースマップ POI を選択中。マーカーは出さず
  // （Google のアイコンをそのまま見せる）吹き出しだけ出す。
  | { kind: "poi"; placeId: string };

// 表示集合が変わったときだけ地図を fit し直すためのキー。
function pointsKey(points: LatLng[]): string {
  return points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
}

function MapController({
  points,
  panTo,
}: {
  points: LatLng[];
  panTo: LatLng | null;
}) {
  const map = useMap();
  const key = pointsKey(points);

  useEffect(() => {
    if (!map) return;
    if (points.length === 0) {
      map.setCenter(TOKYO);
      map.setZoom(11);
    } else if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(15);
    } else {
      const b = boundsOf(points)!;
      map.fitBounds(
        { south: b.south, west: b.west, north: b.north, east: b.east },
        60,
      );
    }
    // points 自体ではなく key（集合の同一性）で発火させる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);

  // ピン/一覧から選択されたらその位置へ寄せる（吹き出しが画面外に出ないように）。
  useEffect(() => {
    if (!map || !panTo) return;
    map.panTo(panTo);
  }, [map, panTo]);

  return null;
}

export function PlaceMap({
  places,
  memberHueById,
  candidates,
  selected,
  draft,
  onSelectSaved,
  onSelectCandidate,
  onCloseInfo,
  onMapTap,
  onDraftMove,
  onCloseDraft,
  onPoiSelect,
  poi,
  infoContent,
  draftContent,
}: {
  places: PlaceRow[];
  // 候補ピン（tentative=true）の地色を作成者の hue で塗るのに使う。
  memberHueById: Map<string, number | null>;
  candidates: CandidatePlace[];
  selected: Selection | null;
  draft: LatLng | null;
  poi: CandidatePlace | null;
  onSelectSaved: (id: string) => void;
  onSelectCandidate: (placeId: string) => void;
  onCloseInfo: () => void;
  onMapTap: (p: LatLng) => void;
  onDraftMove: (p: LatLng) => void;
  onCloseDraft: () => void;
  onPoiSelect: (c: CandidatePlace) => void;
  infoContent: ReactNode;
  draftContent: ReactNode;
}) {
  const t = useTranslations("place");
  // AdvancedMarker は Map ID 必須（無料。Google Cloud で発行して env に入れる）。
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;
  const colorScheme = useMapColorScheme();
  const placesLib = useMapsLibrary("places");
  const map = useMap();
  // 長押しで仮ピンを置いた直後に来る合成 click を 1 回だけ食う（タイミング
  // 非依存。これが無いと touchend→click が draft 上の余白タップ＝閉じる
  // に化け、指を離した瞬間に仮ピンが消える）。
  const ignoreNextMapClick = useRef(false);
  // 直近にタッチがあった締切。これ以内の click はタッチ由来とみなし、
  // 自由ピンの click ドロップ（＝マウス専用）を行わない。
  const recentTouchUntil = useRef(0);


  // 未マップ（自由入力）の場所は座標が無いので地図に出さない。
  const mappedPlaces = useMemo(
    () =>
      places.filter(
        (p): p is PlaceRow & { lat: number; lng: number } =>
          p.lat != null && p.lng != null,
      ),
    [places],
  );

  // 保存済みピンをエリアでクラスタリング（検索中はチップを出さない）。
  const clusters = useMemo<Cluster[]>(
    () =>
      candidates.length > 0
        ? []
        : clusterPlaces(
            mappedPlaces.map((p) => ({
              lat: p.lat,
              lng: p.lng,
              region: p.region,
              locality: p.locality,
            })),
          ),
    [candidates, mappedPlaces],
  );
  const main = useMemo(() => dominantCluster(clusters), [clusters]);

  // 既定でズームする点群: 検索中は候補、エリアが割れていれば主役クラスタ、
  // 主役が決まらなければ全ピン。
  const focusPoints: LatLng[] = useMemo(() => {
    if (candidates.length > 0)
      return candidates.map((c) => ({ lat: c.lat, lng: c.lng }));
    if (main) return main.points.map((p) => ({ lat: p.lat, lng: p.lng }));
    return mappedPlaces.map((p) => ({ lat: p.lat, lng: p.lng }));
  }, [candidates, main, mappedPlaces]);

  // fitBounds 前の初期中心。bounds 中心なら日付変更線跨ぎでも正しい側に出る。
  const initBounds = boundsOf(focusPoints);
  const initialCenter = initBounds ? centerOf(initBounds) : TOKYO;

  // チップで手動フォーカスしたエリア。null=既定（主役 or 全体）。-1="すべて"。
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const activeIdx = focusedIdx ?? (main ? 0 : -1);

  const focusBounds = useCallback(
    (b: { south: number; west: number; north: number; east: number }) => {
      map?.fitBounds(
        { south: b.south, west: b.west, north: b.north, east: b.east },
        60,
      );
    },
    [map],
  );
  const focusCluster = (c: Cluster, idx: number) => {
    setFocusedIdx(idx);
    if (!map) return;
    if (c.size === 1) {
      map.setCenter({ lat: c.points[0].lat, lng: c.points[0].lng });
      map.setZoom(14);
      return;
    }
    focusBounds(c.bounds);
  };
  const focusAll = () => {
    setFocusedIdx(-1);
    const b = boundsOf(mappedPlaces.map((p) => ({ lat: p.lat, lng: p.lng })));
    if (b) focusBounds(b);
  };

  const selectedPos: LatLng | null = useMemo(() => {
    if (!selected) return null;
    if (selected.kind === "saved") {
      const p = places.find((x) => x.id === selected.id);
      return p && p.lat != null && p.lng != null
        ? { lat: p.lat, lng: p.lng }
        : null;
    }
    if (selected.kind === "poi") {
      return poi ? { lat: poi.lat, lng: poi.lng } : null;
    }
    const c = candidates.find((x) => x.placeId === selected.placeId);
    return c ? { lat: c.lat, lng: c.lng } : null;
  }, [selected, places, candidates, poi]);

  return (
    <div className="space-y-1">
      <div className="relative h-[32rem] w-full overflow-hidden rounded-md border border-foreground/10">
        <Map
          mapId={mapId}
          colorScheme={colorScheme}
          defaultCenter={initialCenter}
          defaultZoom={places.length > 1 ? 11 : 13}
          gestureHandling="greedy"
          disableDefaultUI
          // 本家同様、ベースマップの POI（店/施設）アイコンをタップ可能に。
          clickableIcons
          onClick={(e) => {
            // 長押しで置いた直後の合成 click を 1 回だけ食う（draft 即閉じ
            // 防止）。pointerup 由来等で click が touchend より先でも確実。
            if (ignoreNextMapClick.current) {
              ignoreNextMapClick.current = false;
              return;
            }
            // POI アイコンのタップ: placeId が取れる。Google 既定の吹き出しを
            // 止めて、Place Details を 1 回引いて候補として登録フォームへ
            // （ユーザ操作時のみの課金。サジェスト確定と同種）。
            const poiId = e.detail.placeId;
            if (poiId) {
              e.stop();
              if (!placesLib) return;
              void (async () => {
                try {
                  const place = new placesLib.Place({ id: poiId });
                  await place.fetchFields({
                    fields: [
                      "id",
                      "displayName",
                      "formattedAddress",
                      "addressComponents",
                      "location",
                    ],
                  });
                  const loc = place.location;
                  if (!place.id || !loc) return;
                  onPoiSelect({
                    placeId: place.id,
                    name: place.displayName ?? t("unknownName"),
                    address: place.formattedAddress ?? "",
                    lat: loc.lat(),
                    lng: loc.lng(),
                    ...extractRegion(place.addressComponents),
                    rating: null,
                    userRatingCount: null,
                    photoUri: null,
                  });
                } catch {
                  // 取得失敗時は何もしない（空白タップの手動ピンで代替可）
                }
              })();
              return;
            }
            // 何か開いていれば「閉じるだけ」優先。
            if (selected) {
              onCloseInfo();
              return;
            }
            if (draft) {
              onCloseDraft();
              return;
            }
            // PC（マウス）の普通クリックは本家同様その場に自由ピン。
            // 直近に touch があった＝タッチ端末なので落とさない（自由位置
            // はタッチでは長押し）。マウスは touch を出さないので通る。
            if (performance.now() >= recentTouchUntil.current) {
              const ll = e.detail.latLng;
              if (ll) onMapTap({ lat: ll.lat, lng: ll.lng });
            }
          }}
          style={{ width: "100%", height: "100%" }}
        >
          <MapController points={focusPoints} panTo={selectedPos} />
          <LongPressPin
            onLongPress={onMapTap}
            ignoreNextMapClick={ignoreNextMapClick}
            recentTouchUntil={recentTouchUntil}
          />

          {mapId &&
            mappedPlaces.map((p) => {
              // 候補（tentative=true）は半透明 + 作成者のメンバー色で塗る。
              // 確定（tentative=false）は固定のグリーンで塗る。
              const creatorHue = memberHueById.get(p.created_by_member_id);
              const isDarkMap = colorScheme === "DARK";
              const bg = isDarkMap
                ? pastelBgColor(p.tentative ? creatorHue : 140)
                : p.tentative
                  ? (vividColor(creatorHue) ?? "#6b7280")
                  : "#10b981";
              return (
                <AdvancedMarker
                  key={p.id}
                  position={{ lat: p.lat, lng: p.lng }}
                  title={p.name}
                  onClick={() => onSelectSaved(p.id)}
                >
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full border-2 shadow ${
                      isDarkMap ? "border-gray-500" : "border-white"
                    } ${p.tentative ? "opacity-50" : ""}`}
                    style={{ backgroundColor: bg, color: isDarkMap ? "#202124" : "white" }}
                  >
                    <PlaceIcon icon={p.icon} size={16} />
                  </div>
                </AdvancedMarker>
              );
            })}

          {mapId &&
            candidates.map((c) => {
              const isSel =
                selected?.kind === "candidate" &&
                selected.placeId === c.placeId;
              return (
                <AdvancedMarker
                  key={`cand-${c.placeId}`}
                  position={{ lat: c.lat, lng: c.lng }}
                  title={c.name}
                  onClick={() => onSelectCandidate(c.placeId)}
                >
                  {isSel ? (
                    <RedPin />
                  ) : (
                    // 非選択: 本家の小さい赤リングの丸（赤枠太め・白小さめ）
                    <div className="h-[18px] w-[18px] rounded-full border-[5px] border-[#EA4335] bg-white shadow" />
                  )}
                </AdvancedMarker>
              );
            })}

          {selected && selectedPos && (
            <InfoWindow
              position={selectedPos}
              onCloseClick={onCloseInfo}
              // 横幅は中身側の可変幅（各 *Info の w-[min(16rem,calc(100vw-3rem))]）
              // と globals.css の .gm-style-iw-* 上書きで制御する。maxWidth は
              // Google が中身より狭く頭打ちさせて端切れ・横スクロールの原因に
              // なるので使わない。
              headerDisabled
              // 候補＝雫ピン（draft と同形）は深め、保存済み・POI は浅め。
              pixelOffset={[
                0,
                selected.kind === "candidate"
                  ? INFO_OFFSET_PIN
                  : INFO_OFFSET_ICON,
              ]}
            >
              {infoContent}
            </InfoWindow>
          )}

          {mapId && draft && (
            <AdvancedMarker
              position={draft}
              draggable
              onDragEnd={(e) => {
                // ドラッグ離し直後に来るマップ click（特に PC）が
                // 「余白タップ→draft 閉じる」に化けるのを 1 回食う。
                ignoreNextMapClick.current = true;
                if (e.latLng) {
                  onDraftMove({ lat: e.latLng.lat(), lng: e.latLng.lng() });
                }
              }}
            >
              {/* 仮ピン＝検索候補の選択時と同じ赤い雫ピン（未保存の点） */}
              <RedPin />
            </AdvancedMarker>
          )}

          {draft && (
            <InfoWindow
              position={draft}
              onCloseClick={onCloseDraft}
              headerDisabled
              pixelOffset={[0, INFO_OFFSET_PIN]}
            >
              {draftContent}
            </InfoWindow>
          )}
        </Map>
      </div>
      {clusters.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {clusters.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => focusCluster(c, i)}
              className={`rounded-full border px-2 py-0.5 text-xs ${
                activeIdx === i
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-foreground/20 bg-background text-muted-foreground"
              }`}
            >
              {c.label ?? t("other")}
            </button>
          ))}
          <button
            type="button"
            onClick={focusAll}
            className={`rounded-full border px-2 py-0.5 text-xs ${
              activeIdx === -1
                ? "border-primary bg-primary text-primary-foreground"
                : "border-foreground/20 bg-background text-muted-foreground"
            }`}
          >
            {t("filterAll")}
          </button>
        </div>
      )}
      {!mapId && (
        <p className="text-xs text-amber-700">
          {t("noMapId")}
        </p>
      )}
    </div>
  );
}
