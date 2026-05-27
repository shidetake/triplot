"use client";

import { getIconPath } from "@/lib/placeIcons";
import type { Visibility } from "@/lib/types/database";

import { ColorBadge } from "./color-badge";

export type PlaceStatus = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  tentative: boolean;
};

export type PlaceRow = {
  id: string;
  name: string;
  // 未マップ（自由入力）の場所は座標・住所・gpid を持たない。
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  formatted_address: string | null;
  region: string | null;
  locality: string | null;
  status_id: string;
  visibility: Visibility;
  note: string | null;
  icon: string;
  created_by_member_id: string;
  created_at: string;
};

// PLACE_ICONS / ICON_PATHS は lib/placeIcons.ts に統合した。
// アイコン集合は今や trip_pin_options（DB）から来る。アイコン SVG パスは
// カタログ(lib/placeIcons.ts) の単一の真。
export function PlaceIcon({
  icon,
  size = 18,
  className,
}: {
  icon: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 -960 960 960"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d={getIconPath(icon)} />
    </svg>
  );
}

export function gmapsUrl(
  p: Pick<PlaceRow, "name" | "google_place_id" | "lat" | "lng">,
): string {
  const base = `https://www.google.com/maps/search/?api=1&query=`;
  // Google 由来は place_id でピンポイント、手動ピンは座標、
  // 未マップ（座標も無い）は名前で検索だけ。
  if (p.google_place_id) {
    return `${base}${encodeURIComponent(p.name)}&query_place_id=${p.google_place_id}`;
  }
  if (p.lat != null && p.lng != null) {
    return `${base}${p.lat},${p.lng}`;
  }
  return `${base}${encodeURIComponent(p.name)}`;
}

export function PlaceList({
  places,
  statuses,
  selectedId,
  locatingId,
  onSelect,
  onLocate,
  onCancelLocate,
}: {
  places: PlaceRow[];
  statuses: PlaceStatus[];
  selectedId: string | null;
  // 現在「位置を指定」モード中の未マップ place の id（あれば）。
  // その行は active 表示にして、クリックで取り消しできるようにする。
  locatingId: string | null;
  onSelect: (id: string) => void;
  // 未マップ行をクリックしたとき: 地図で位置を指定するモードを開始する。
  onLocate: (id: string, name: string) => void;
  onCancelLocate: () => void;
}) {
  const statusById = new Map(statuses.map((s) => [s.id, s]));

  if (places.length === 0) {
    return null;
  }

  return (
    <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white">
      {places.map((p) => {
        const status = statusById.get(p.status_id);
        const isSelected = p.id === selectedId;
        const unmapped = p.lat == null;
        const isLocating = unmapped && p.id === locatingId;
        return (
          <li key={p.id}>
            <button
              type="button"
              onClick={() =>
                isLocating
                  ? onCancelLocate()
                  : unmapped
                    ? onLocate(p.id, p.name)
                    : onSelect(p.id)
              }
              className={`flex w-full items-start gap-2 p-3 text-left text-sm transition ${
                isLocating
                  ? "border-l-4 border-amber-400 bg-amber-50"
                  : isSelected
                    ? "bg-zinc-50 hover:bg-zinc-50"
                    : "hover:bg-zinc-50"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {status && (
                    <ColorBadge color={status.color}>{status.name}</ColorBadge>
                  )}
                  <span className="font-medium">{p.name}</span>
                  {p.visibility === "private" && (
                    <span className="rounded bg-zinc-100 px-1.5 text-xs text-zinc-600">
                      プライベート
                    </span>
                  )}
                  {unmapped && (
                    <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-700">
                      地図未登録
                    </span>
                  )}
                </div>
                {p.note && (
                  <p className="mt-1 text-xs text-zinc-700">{p.note}</p>
                )}
                {isLocating && (
                  <p className="mt-1 text-xs text-amber-800">
                    地図でクリック / 長押しでピンを置いてください
                  </p>
                )}
              </div>
              {unmapped && (
                <span
                  className={`shrink-0 text-xs ${
                    isLocating ? "text-amber-700" : "text-blue-600"
                  }`}
                >
                  {isLocating ? "やめる" : "ピンを設定"}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
