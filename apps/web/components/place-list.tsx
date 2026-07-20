"use client";

import { getIconOutlinePath, getIconPath } from "@triplot/shared/placeIcons";
import { useTranslations } from "next-intl";

import { ColorBadge } from "./color-badge";
import { PrivateBadge } from "./private-badge";

// 型の単一の真実は shared 側（RN と共用）。既存 import を壊さないよう re-export。
import type { PlaceRow } from "@triplot/shared/tripDerive";
export type { PlaceRow };

// PLACE_ICONS / ICON_PATHS は lib/placeIcons.ts に統合した。
// アイコン集合は今や trip_pin_options（DB）から来る。アイコン SVG パスは
// カタログ(lib/placeIcons.ts) の単一の真。
export function PlaceIcon({
  icon,
  size = 18,
  className,
  outline = false,
}: {
  icon: string;
  size?: number;
  className?: string;
  // アイコンピッカーの「未追加」表示専用。Material Symbols の非塗りグリフ
  // （塗りパスとは別データ。lib/placeIcons.ts のコメント参照）。
  outline?: boolean;
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
      <path d={outline ? getIconOutlinePath(icon) : getIconPath(icon)} />
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
  selectedId,
  locatingId,
  onSelect,
  onLocate,
  onCancelLocate,
}: {
  places: PlaceRow[];
  selectedId: string | null;
  // 現在「位置を指定」モード中の未マップ place の id（あれば）。
  // その行は active 表示にして、クリックで取り消しできるようにする。
  locatingId: string | null;
  onSelect: (id: string) => void;
  // 未マップ行をクリックしたとき: 地図で位置を指定するモードを開始する。
  onLocate: (id: string, name: string) => void;
  onCancelLocate: () => void;
}) {
  const t = useTranslations("place");

  if (places.length === 0) {
    return null;
  }

  return (
    <ul className="divide-y divide-foreground/10 rounded-md border border-foreground/10 bg-background">
      {places.map((p) => {
        const statusLabel = p.tentative ? t("statusCandidate") : t("statusConfirmed");
        const statusColor = p.tentative ? "#f59e0b" : "#10b981";
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
                  ? "border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-400/10"
                  : isSelected
                    ? "bg-accent"
                    : "hover:bg-foreground/10"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <ColorBadge color={statusColor}>{statusLabel}</ColorBadge>
                  <span className="font-medium">{p.name}</span>
                  {p.visibility === "private" && <PrivateBadge />}
                  {unmapped && (
                    <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-700 dark:bg-amber-400/20 dark:text-amber-300">
                      {t("unmapped")}
                    </span>
                  )}
                </div>
                {p.note && (
                  <p className="mt-1 text-xs text-muted-foreground">{p.note}</p>
                )}
                {isLocating && (
                  <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                    {t("locatingHint")}
                  </p>
                )}
              </div>
              {unmapped && (
                <span
                  className={`shrink-0 text-xs ${
                    isLocating ? "text-amber-700 dark:text-amber-400" : "text-blue-600"
                  }`}
                >
                  {isLocating ? t("cancelLocate") : t("setPin")}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
