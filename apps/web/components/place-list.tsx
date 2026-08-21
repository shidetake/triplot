"use client";

import {
  getIconLabel,
  getIconOutlinePath,
  getIconPath,
} from "@triplot/shared/placeIcons";
import type { VisitDay } from "@triplot/shared/placeOrder";
import { formatDayLabel } from "@triplot/shared/schedule";
import { useTranslations } from "next-intl";

import { ChevronIcon, CloseIcon } from "./icons";
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
  style,
  outline = false,
}: {
  icon: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
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
      style={style}
      aria-hidden
    >
      <path d={outline ? getIconOutlinePath(icon) : getIconPath(icon)} />
    </svg>
  );
}

// URL の組み立ては shared（RN の場所編集シートと共用）。既存 import を
// 壊さないよう、ここから re-export する。
export { gmapsUrl } from "@triplot/shared/placeLink";

export function PlaceList({
  places,
  selectedId,
  locatingId,
  dayByPlaceId,
  areaByPlaceId,
  locale,
  onSelect,
  onLocate,
  onCancelLocate,
  onDismissLocation,
}: {
  places: PlaceRow[];
  selectedId: string | null;
  // 選択中の行に出す「◯日目・M/D(曜)」「エリア」バッジ用（無い場所は出さない）。
  dayByPlaceId: Map<string, VisitDay>;
  areaByPlaceId: Map<string, string | null>;
  locale: string;
  // 現在「位置を指定」モード中の未マップ place の id（あれば）。
  // その行は active 表示にして、クリックで取り消しできるようにする。
  locatingId: string | null;
  onSelect: (id: string) => void;
  // 未マップ行をクリックしたとき: 地図で位置を指定するモードを開始する。
  onLocate: (id: string, name: string) => void;
  onCancelLocate: () => void;
  // 「地図未登録」バッジの × : 地図に登録せずこのまま使う。
  onDismissLocation: (id: string) => void;
}) {
  const t = useTranslations("place");

  if (places.length === 0) {
    return null;
  }

  return (
    <ul className="divide-y divide-foreground/10 rounded-md border border-foreground/10 bg-background">
      {places.map((p) => {
        const statusLabel = p.tentative
          ? t("statusCandidate")
          : t("statusConfirmed");
        const statusColor = p.tentative ? "#f59e0b" : "#10b981";
        const isSelected = p.id === selectedId;
        // タップ時の遷移先（位置を指定モード）は座標の有無だけで決める
        // （破棄済みでもいつでも地図に登録し直せるように、行クリック自体は
        // 従来どおり）。バッジの表示だけ location_dismissed で分ける。
        const unmapped = p.lat == null;
        const showUnmappedBadge = unmapped && !p.location_dismissed;
        const isLocating = unmapped && p.id === locatingId;
        const day = dayByPlaceId.get(p.id);
        const area = areaByPlaceId.get(p.id) ?? null;
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
              {/* 種別のアイコンを候補=琥珀／確定=緑で塗る（iOS の一覧と同じ。
                  以前はステータスを文字のバッジで出していたが、アイコンの色で
                  同じことが分かるぶん行が短くなる）。 */}
              <PlaceIcon
                icon={p.icon}
                size={20}
                className="mt-0.5 shrink-0"
                style={{ color: statusColor }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  {p.visibility === "private" && <PrivateBadge />}
                  {showUnmappedBadge && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDismissLocation(p.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.stopPropagation();
                        e.preventDefault();
                        onDismissLocation(p.id);
                      }}
                      aria-label={t("dismissLocationAria")}
                      className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 text-xs text-amber-700 hover:bg-amber-200 dark:bg-amber-400/20 dark:text-amber-300 dark:hover:bg-amber-400/30"
                    >
                      {t("unmapped")}
                      <CloseIcon size={12} />
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {statusLabel} ・ {getIconLabel(p.icon)}
                </p>
                {/* 住所・日付/エリアは選択中の行だけ（一覧の見通しを保つ。
                    iOS も展開した行だけに出す）。 */}
                {isSelected && p.formatted_address && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {p.formatted_address}
                  </p>
                )}
                {isSelected && (day || area) && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {/* 何日目・日付は「一番伝えたい情報」なので塗りチップで
                        強調する（iOS と同値: secondary の地＋前景色の太字）。
                        エリアはその補足なのでチップにせず控えめなテキストのみ。 */}
                    {day && (
                      <span className="rounded bg-secondary px-1.5 font-semibold text-foreground">
                        {t("dayBadge", {
                          day: day.dayIndex,
                          date: formatDayLabel(day.date, locale),
                        })}
                      </span>
                    )}
                    {area && <span>{area}</span>}
                  </div>
                )}
                {p.note && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {p.note}
                  </p>
                )}
                {isLocating && (
                  <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                    {t("locatingHint")}
                  </p>
                )}
              </div>
              {unmapped ? (
                <span
                  className={`shrink-0 text-xs ${
                    isLocating
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-blue-600"
                  }`}
                >
                  {isLocating ? t("cancelLocate") : t("setPin")}
                </span>
              ) : (
                // 選択中の行にだけ「＞」を出す＝もう1タップで詳細に進めることを
                // 示す（iOS 標準リストのディスクロージャと同じ表し方。iOS 版と
                // 同形）。
                isSelected && (
                  <ChevronIcon
                    size={16}
                    className="mt-0.5 shrink-0 text-muted-foreground"
                  />
                )
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
