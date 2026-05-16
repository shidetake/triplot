"use client";

import { useMemo } from "react";

import { Map, Marker } from "@vis.gl/react-google-maps";

import type { PlaceRow } from "./place-list";

type Pinned = PlaceRow & { lat: number; lng: number };

export function PlaceMap({ places }: { places: PlaceRow[] }) {
  const pins = useMemo(
    () =>
      places.filter(
        (p): p is Pinned => p.lat != null && p.lng != null,
      ),
    [places],
  );

  const center = useMemo(() => {
    if (pins.length === 0) {
      return { lat: 35.681236, lng: 139.767125 }; // 東京駅
    }
    const lat = pins.reduce((s, p) => s + p.lat, 0) / pins.length;
    const lng = pins.reduce((s, p) => s + p.lng, 0) / pins.length;
    return { lat, lng };
  }, [pins]);

  return (
    <div className="h-72 w-full overflow-hidden rounded-md border border-zinc-200">
      <Map
        // pin の数で remount して中心・ズームを取り直す（uncontrolled props のため）
        key={pins.length}
        defaultCenter={center}
        defaultZoom={pins.length > 1 ? 11 : 13}
        gestureHandling="greedy"
        style={{ width: "100%", height: "100%" }}
      >
        {pins.map((p) => (
          <Marker
            key={p.id}
            position={{ lat: p.lat, lng: p.lng }}
            title={p.name}
          />
        ))}
      </Map>
    </div>
  );
}
