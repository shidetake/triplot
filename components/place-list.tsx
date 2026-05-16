"use client";

import { useTransition } from "react";

import { deletePlaceAction } from "@/app/trips/[tripId]/actions";
import type { Visibility } from "@/lib/types/database";

import type { PlaceStatus } from "./place-form";

export type PlaceRow = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  status_id: string;
  visibility: Visibility;
  note: string | null;
  created_by_member_id: string;
  created_at: string;
};

function gmapsUrl(p: PlaceRow): string | null {
  if (p.google_place_id) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      p.name,
    )}&query_place_id=${p.google_place_id}`;
  }
  if (p.lat != null && p.lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  }
  return null;
}

export function PlaceList({
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
  const statusById = new Map(statuses.map((s) => [s.id, s]));

  if (places.length === 0) {
    return (
      <p className="text-sm text-zinc-500">まだ場所は登録されていません。</p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white">
      {places.map((p) => (
        <PlaceRowItem
          key={p.id}
          tripId={tripId}
          place={p}
          status={statusById.get(p.status_id)}
          canDelete={
            p.visibility === "private"
              ? p.created_by_member_id === myMemberId
              : true
          }
        />
      ))}
    </ul>
  );
}

function PlaceRowItem({
  tripId,
  place,
  status,
  canDelete,
}: {
  tripId: string;
  place: PlaceRow;
  status: PlaceStatus | undefined;
  canDelete: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const onDelete = () => {
    if (!confirm("この場所を削除しますか？")) return;
    startTransition(async () => {
      const { error } = await deletePlaceAction(tripId, place.id);
      if (error) alert(`削除に失敗しました: ${error}`);
    });
  };

  const url = gmapsUrl(place);

  return (
    <li className="flex items-start justify-between gap-3 p-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {status && (
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
              style={{ backgroundColor: status.color }}
            >
              {status.name}
            </span>
          )}
          <span className="font-medium">{place.name}</span>
          {place.visibility === "private" && (
            <span className="rounded bg-zinc-100 px-1.5 text-xs text-zinc-600">
              プライベート
            </span>
          )}
        </div>
        {place.note && (
          <p className="mt-1 text-xs text-zinc-700">{place.note}</p>
        )}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-xs text-blue-600 hover:underline"
          >
            Googleマップで開く
          </a>
        )}
      </div>
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={isPending}
          className="shrink-0 text-xs text-zinc-500 hover:text-red-600 disabled:opacity-50"
        >
          {isPending ? "削除中..." : "削除"}
        </button>
      )}
    </li>
  );
}
