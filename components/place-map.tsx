"use client";

import { type ReactNode, useEffect, useMemo } from "react";

import {
  AdvancedMarker,
  InfoWindow,
  Map,
  useMap,
} from "@vis.gl/react-google-maps";

import { boundsOf, centroid, type LatLng, TOKYO } from "@/lib/placeMap";

import { PlaceIcon, type PlaceRow, type PlaceStatus } from "./place-list";
import type { CandidatePlace } from "./place-search";

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
  onSelectSaved,
  onSelectCandidate,
  onCloseInfo,
  infoContent,
}: {
  places: PlaceRow[];
  statuses: PlaceStatus[];
  candidates: CandidatePlace[];
  selected: Selection | null;
  onSelectSaved: (id: string) => void;
  onSelectCandidate: (placeId: string) => void;
  onCloseInfo: () => void;
  infoContent: ReactNode;
}) {
  // AdvancedMarker は Map ID 必須（無料。Google Cloud で発行して env に入れる）。
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;

  const statusById: Record<string, PlaceStatus> = useMemo(
    () => Object.fromEntries(statuses.map((s) => [s.id, s])),
    [statuses],
  );

  // 検索結果があればそちらに、無ければ保存済みピンに合わせる。
  const fitPoints: LatLng[] = useMemo(
    () =>
      candidates.length > 0
        ? candidates.map((c) => ({ lat: c.lat, lng: c.lng }))
        : places.map((p) => ({ lat: p.lat, lng: p.lng })),
    [candidates, places],
  );

  const initialCenter = centroid(fitPoints) ?? TOKYO;

  const selectedPos: LatLng | null = useMemo(() => {
    if (!selected) return null;
    if (selected.kind === "saved") {
      const p = places.find((x) => x.id === selected.id);
      return p ? { lat: p.lat, lng: p.lng } : null;
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
          clickableIcons={false}
          onClick={() => selected && onCloseInfo()}
          style={{ width: "100%", height: "100%" }}
        >
          <MapController points={fitPoints} panTo={selectedPos} />

          {mapId &&
            places.map((p) => {
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
