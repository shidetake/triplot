"use client";

import { APIProvider } from "@vis.gl/react-google-maps";

import { PlaceForm, type PlaceStatus } from "./place-form";
import { PlaceList, type PlaceRow } from "./place-list";
import { PlaceMap } from "./place-map";

export function PlacesSection({
  tripId,
  places,
  statuses,
  myMemberId,
}: {
  tripId: string;
  places: PlaceRow[];
  statuses: PlaceStatus[];
  myMemberId: string;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <div className="space-y-4">
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Google Maps API キーが未設定のため、地図と場所検索は無効です（一覧のみ表示）。
        </p>
        <PlaceList
          tripId={tripId}
          places={places}
          statuses={statuses}
          myMemberId={myMemberId}
        />
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <div className="space-y-4">
        <PlaceMap places={places} />
        <details className="rounded-md border border-zinc-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            場所を追加
          </summary>
          <div className="border-t border-zinc-200 p-4">
            <PlaceForm tripId={tripId} statuses={statuses} />
          </div>
        </details>
        <PlaceList
          tripId={tripId}
          places={places}
          statuses={statuses}
          myMemberId={myMemberId}
        />
      </div>
    </APIProvider>
  );
}
