"use client";

import { type ReactNode, useEffect, useMemo } from "react";

import {
  AdvancedMarker,
  InfoWindow,
  Map,
  Pin,
  useMap,
} from "@vis.gl/react-google-maps";

import { boundsOf, centroid, type LatLng, TOKYO } from "@/lib/placeMap";

import type { PlaceRow, PlaceStatus } from "./place-list";
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

  const statusColor = useMemo(
    () => Object.fromEntries(statuses.map((s) => [s.id, s.color])),
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
            places.map((p) => (
              <AdvancedMarker
                key={p.id}
                position={{ lat: p.lat, lng: p.lng }}
                title={p.name}
                onClick={() => onSelectSaved(p.id)}
              >
                <Pin
                  background={statusColor[p.status_id] ?? "#6b7280"}
                  borderColor="#ffffff"
                  glyphColor="#ffffff"
                />
              </AdvancedMarker>
            ))}

          {mapId &&
            candidates.map((c) => (
              <AdvancedMarker
                key={`cand-${c.placeId}`}
                position={{ lat: c.lat, lng: c.lng }}
                title={c.name}
                onClick={() => onSelectCandidate(c.placeId)}
              >
                {/* 候補は中空の白ピンで保存済みと視覚的に区別 */}
                <Pin
                  background="#ffffff"
                  borderColor="#3b82f6"
                  glyphColor="#3b82f6"
                  scale={0.9}
                />
              </AdvancedMarker>
            ))}

          {selected && selectedPos && (
            <InfoWindow
              position={selectedPos}
              onCloseClick={onCloseInfo}
              maxWidth={300}
              headerDisabled
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
