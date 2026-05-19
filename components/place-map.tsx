"use client";

import {
  type MutableRefObject,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
} from "react";

import {
  AdvancedMarker,
  InfoWindow,
  Map,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";

import { boundsOf, centroid, type LatLng, TOKYO } from "@/lib/placeMap";

import { PlaceIcon, type PlaceRow, type PlaceStatus } from "./place-list";
import type { CandidatePlace } from "./place-search";

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
  suppressClickUntil,
  recentTouchUntil,
}: {
  onLongPress: (p: LatLng) => void;
  suppressClickUntil: MutableRefObject<number>;
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
    let pressFired = false;
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
      if (ev.touches.length !== 1) {
        clear();
        return;
      }
      pressFired = false;
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
          pressFired = true;
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
      // 長押しが発火していたら、離した直後に来る合成 click で draft を
      // 即閉じしないよう抑止（保持時間に依らず touchend 基準で覆う）。
      if (pressFired) suppressClickUntil.current = performance.now() + 700;
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
  }, [map, onLongPress, suppressClickUntil, recentTouchUntil]);

  return null;
}

export type Selection =
  | { kind: "saved"; id: string }
  | { kind: "candidate"; placeId: string };

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
  statuses,
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
  infoContent,
  draftContent,
}: {
  places: PlaceRow[];
  statuses: PlaceStatus[];
  candidates: CandidatePlace[];
  selected: Selection | null;
  draft: LatLng | null;
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
  // AdvancedMarker は Map ID 必須（無料。Google Cloud で発行して env に入れる）。
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;
  const placesLib = useMapsLibrary("places");
  // 長押しで仮ピンを置いた直後の合成 click を無視する締切（performance.now）。
  const suppressClickUntil = useRef(0);
  // 直近にタッチがあった締切。これ以内の click はタッチ由来とみなし、
  // 自由ピンの click ドロップ（＝マウス専用）を行わない。
  const recentTouchUntil = useRef(0);

  const statusById: Record<string, PlaceStatus> = useMemo(
    () => Object.fromEntries(statuses.map((s) => [s.id, s])),
    [statuses],
  );

  // 未マップ（自由入力）の場所は座標が無いので地図に出さない。
  const mappedPlaces = useMemo(
    () =>
      places.filter(
        (p): p is PlaceRow & { lat: number; lng: number } =>
          p.lat != null && p.lng != null,
      ),
    [places],
  );

  // 検索結果があればそちらに、無ければ保存済みピンに合わせる。
  const fitPoints: LatLng[] = useMemo(
    () =>
      candidates.length > 0
        ? candidates.map((c) => ({ lat: c.lat, lng: c.lng }))
        : mappedPlaces.map((p) => ({ lat: p.lat, lng: p.lng })),
    [candidates, mappedPlaces],
  );

  const initialCenter = centroid(fitPoints) ?? TOKYO;

  const selectedPos: LatLng | null = useMemo(() => {
    if (!selected) return null;
    if (selected.kind === "saved") {
      const p = places.find((x) => x.id === selected.id);
      return p && p.lat != null && p.lng != null
        ? { lat: p.lat, lng: p.lng }
        : null;
    }
    const c = candidates.find((x) => x.placeId === selected.placeId);
    return c ? { lat: c.lat, lng: c.lng } : null;
  }, [selected, places, candidates]);

  return (
    <div className="space-y-1">
      <div className="h-[32rem] w-full overflow-hidden rounded-md border border-zinc-200">
        <Map
          mapId={mapId}
          defaultCenter={initialCenter}
          defaultZoom={places.length > 1 ? 11 : 13}
          gestureHandling="greedy"
          disableDefaultUI
          // 本家同様、ベースマップの POI（店/施設）アイコンをタップ可能に。
          clickableIcons
          onClick={(e) => {
            // 長押しで置いた直後の合成 click は無視（draft 即閉じ防止）。
            if (performance.now() < suppressClickUntil.current) return;
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
                      "location",
                    ],
                  });
                  const loc = place.location;
                  if (!place.id || !loc) return;
                  onPoiSelect({
                    placeId: place.id,
                    name: place.displayName ?? "(名称不明)",
                    address: place.formattedAddress ?? "",
                    lat: loc.lat(),
                    lng: loc.lng(),
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
          <MapController points={fitPoints} panTo={selectedPos} />
          <LongPressPin
            onLongPress={onMapTap}
            suppressClickUntil={suppressClickUntil}
            recentTouchUntil={recentTouchUntil}
          />

          {mapId &&
            mappedPlaces.map((p) => {
              const st = statusById[p.status_id];
              // 未確定（候補）ステータスは半透明、確定はくっきり
              return (
                <AdvancedMarker
                  key={p.id}
                  position={{ lat: p.lat, lng: p.lng }}
                  title={p.name}
                  onClick={() => onSelectSaved(p.id)}
                >
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-white shadow ${
                      st?.tentative ? "opacity-50" : ""
                    }`}
                    style={{ backgroundColor: st?.color ?? "#6b7280" }}
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
                    // 選択中: 本家 Google の雫ピン（Material location_on の
                    // くびれ形状）。先端を座標に合わせて上げる。
                    <svg
                      width="34"
                      height="34"
                      viewBox="0 -960 960 960"
                      aria-hidden
                      style={{
                        transform: "translateY(-46%)",
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
              maxWidth={300}
              headerDisabled
              // ピンに被らないよう、ピン高さ分だけ上へ逃がす
              // （選択中の候補＝雫ピンは背が高いので多め）。
              pixelOffset={[0, selected.kind === "candidate" ? -52 : -24]}
            >
              {infoContent}
            </InfoWindow>
          )}

          {mapId && draft && (
            <AdvancedMarker
              position={draft}
              draggable
              onDragEnd={(e) => {
                if (e.latLng) {
                  onDraftMove({ lat: e.latLng.lat(), lng: e.latLng.lng() });
                }
              }}
            >
              {/* 仮ピン: 保存済み（status色）・候補（赤）と区別できる紫 */}
              <div className="h-5 w-5 rounded-full border-2 border-white bg-indigo-600 shadow ring-2 ring-indigo-300" />
            </AdvancedMarker>
          )}

          {draft && (
            <InfoWindow
              position={draft}
              onCloseClick={onCloseDraft}
              maxWidth={300}
              headerDisabled
              pixelOffset={[0, -24]}
            >
              {draftContent}
            </InfoWindow>
          )}
        </Map>
      </div>
      {!mapId && (
        <p className="text-xs text-amber-700">
          Map ID 未設定のため地図上のピンは表示できません（一覧から操作してください）。
        </p>
      )}
    </div>
  );
}
