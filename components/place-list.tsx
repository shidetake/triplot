"use client";

import type { Visibility } from "@/lib/types/database";

export type PlaceStatus = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
};

export type PlaceRow = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  google_place_id: string;
  formatted_address: string;
  status_id: string;
  visibility: Visibility;
  note: string | null;
  created_by_member_id: string;
  created_at: string;
};

export function gmapsUrl(p: Pick<PlaceRow, "name" | "google_place_id">): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    p.name,
  )}&query_place_id=${p.google_place_id}`;
}

export function PlaceList({
  places,
  statuses,
  selectedId,
  onSelect,
}: {
  places: PlaceRow[];
  statuses: PlaceStatus[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const statusById = new Map(statuses.map((s) => [s.id, s]));

  if (places.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        まだ場所はありません。上で検索して地図のピンから追加してください。
      </p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white">
      {places.map((p) => {
        const status = statusById.get(p.status_id);
        const isSelected = p.id === selectedId;
        return (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onSelect(p.id)}
              className={`flex w-full items-start gap-2 p-3 text-left text-sm transition hover:bg-zinc-50 ${
                isSelected ? "bg-zinc-50" : ""
              }`}
            >
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
                  <span className="font-medium">{p.name}</span>
                  {p.visibility === "private" && (
                    <span className="rounded bg-zinc-100 px-1.5 text-xs text-zinc-600">
                      プライベート
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-zinc-500">
                  {p.formatted_address}
                </p>
                {p.note && (
                  <p className="mt-1 text-xs text-zinc-700">{p.note}</p>
                )}
              </div>
              <span className="shrink-0 text-xs text-blue-600">地図で見る</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
