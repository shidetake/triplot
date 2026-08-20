"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";

import { Menu } from "@base-ui/react/menu";

import { formatDayLabel } from "@triplot/shared/schedule";
import type {
  AreaFilterOption,
  DayFilterOption,
  PlaceFilter,
} from "@triplot/shared/placeFilter";

import { CheckIcon, FilterIcon } from "./icons";
import { NarrowSheet } from "./form-popover";
import { menuItemClass } from "./menu-item";
import { useMediaQuery } from "./use-media-query";
import { Button } from "@/components/ui/button";

// 場所の絞り込み（エリア／日にち／非表示の場所）。iOS の地図右上のフィルタと
// 同じ選択肢・同じ並び順で、地図のピンと一覧の両方を絞り込む。
// 選択肢の組み立ては shared（placeFilter.ts）＝ iOS と同じ規則。
//
// 部品は Base UI Menu（ui-guidelines の部品フロー step2。セクション見出し付きの
// 選択リストは native 要素で足りない）。絞り込み中はトリガを primary の塗りに
// して、掛けっぱなしで忘れないようにする（iOS と同じ扱い）。
export function PlaceFilterMenu({
  filter,
  onChange,
  areaOptions,
  dayOptions,
  dismissedCount,
  showDismissed,
  onToggleDismissed,
  locale,
}: {
  filter: PlaceFilter | null;
  onChange: (f: PlaceFilter | null) => void;
  areaOptions: AreaFilterOption[];
  dayOptions: DayFilterOption[];
  // 「地図未登録」を破棄した場所の件数（0 なら選択肢自体を出さない）。
  dismissedCount: number;
  showDismissed: boolean;
  onToggleDismissed: () => void;
  locale: string;
}) {
  const t = useTranslations("place");
  const active = filter != null || showDismissed;
  // 狭い画面はボトムシート（iOS の formSheet と同じ）。閾値は FormPopover と同じ。
  const narrow = useMediaQuery("(max-width: 639px)");
  const [sheetOpen, setSheetOpen] = useState(false);

  const dayLabel = (d: DayFilterOption) =>
    t("filterDayLabel", {
      day: d.dayIndex,
      date: formatDayLabel(d.date, locale),
    });

  const label = !filter
    ? t("filterAll")
    : filter.kind === "area"
      ? (filter.label ?? t("other"))
      : (dayOptions.find((d) => d.dayIndex === filter.dayIndex)?.date ?? "");

  // 行の仕様を1つに集約し、広い画面（ドロップダウン）と狭い画面（ボトムシート）で
  // 描画側だけ差し替える（trip-actions と同じ形）。iOS はこの絞り込みも formSheet
  // なので、狭い画面はそちらに揃える。
  type Row =
    | { kind: "section"; key: string; label: string }
    | {
        kind: "option";
        key: string;
        label: string;
        count?: number;
        selected: boolean;
        keepOpen?: boolean;
        onSelect: () => void;
      };

  const rows: Row[] = [
    {
      kind: "option",
      key: "all",
      label: t("filterAll"),
      selected: !filter,
      onSelect: () => onChange(null),
    },
    ...(areaOptions.length > 0
      ? ([
          { kind: "section", key: "sec-area", label: t("filterSectionArea") },
          ...areaOptions.map(({ label: areaLabel, count }) => ({
            kind: "option" as const,
            key: `area:${areaLabel ?? ""}`,
            label: areaLabel ?? t("other"),
            count,
            selected: filter?.kind === "area" && filter.label === areaLabel,
            onSelect: () => onChange({ kind: "area", label: areaLabel }),
          })),
        ] as Row[])
      : []),
    ...(dayOptions.length > 0
      ? ([
          { kind: "section", key: "sec-day", label: t("filterSectionDay") },
          ...dayOptions.map((d) => ({
            kind: "option" as const,
            key: `day:${d.dayIndex}`,
            label: dayLabel(d),
            count: d.count,
            selected: filter?.kind === "day" && filter.dayIndex === d.dayIndex,
            onSelect: () => onChange({ kind: "day", dayIndex: d.dayIndex }),
          })),
        ] as Row[])
      : []),
    ...(dismissedCount > 0
      ? ([
          { kind: "section", key: "sec-other", label: t("filterSectionOther") },
          {
            kind: "option",
            key: "dismissed",
            label: t("filterShowDismissed"),
            count: dismissedCount,
            selected: showDismissed,
            keepOpen: true,
            onSelect: onToggleDismissed,
          },
        ] as Row[])
      : []),
  ];

  const sectionClass = "px-3 pb-1 pt-2 text-xs text-muted-foreground";
  const optionClass = (selected: boolean) =>
    `flex w-full items-center gap-2 ${menuItemClass} ${selected ? "bg-accent font-medium" : ""}`;
  const optionBody = (r: Extract<Row, { kind: "option" }>) => (
    <>
      <span className="min-w-0 flex-1 truncate text-left">{r.label}</span>
      {r.count != null && (
        <span className="tabular-nums text-xs text-muted-foreground">
          {r.count}
        </span>
      )}
      {r.selected && <CheckIcon size={16} />}
    </>
  );

  const triggerButton = (onClick?: () => void) => (
    <Button
      onClick={onClick}
      type="button"
      variant={active ? "primary" : "outline"}
      size="icon"
      aria-label={t("filterAria", { label })}
      title={t("filterAria", { label })}
      className="shrink-0 bg-background data-[active]:bg-primary"
    >
      <FilterIcon size={18} />
    </Button>
  );

  if (narrow) {
    return (
      <>
        {triggerButton(() => setSheetOpen(true))}
        {sheetOpen && (
          <NarrowSheet
            label={t("filterTitle")}
            onClose={() => setSheetOpen(false)}
          >
            <div className="pb-2 text-sm">
              {rows.map((r) =>
                r.kind === "section" ? (
                  <div key={r.key} className={sectionClass}>
                    {r.label}
                  </div>
                ) : (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => {
                      r.onSelect();
                      if (!r.keepOpen) setSheetOpen(false);
                    }}
                    className={optionClass(r.selected)}
                  >
                    {optionBody(r)}
                  </button>
                ),
              )}
            </div>
          </NarrowSheet>
        )}
      </>
    );
  }

  return (
    <Menu.Root>
      <Menu.Trigger render={triggerButton()} />
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={8} className="z-50">
          <Menu.Popup className="max-h-64 w-56 overflow-y-auto rounded-md border border-foreground/10 bg-background py-1 text-sm shadow-lg">
            {rows.map((r) =>
              r.kind === "section" ? (
                <div key={r.key} className={sectionClass}>
                  {r.label}
                </div>
              ) : (
                <Menu.Item
                  key={r.key}
                  closeOnClick={!r.keepOpen}
                  onClick={r.onSelect}
                  className={optionClass(r.selected)}
                >
                  {optionBody(r)}
                </Menu.Item>
              ),
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
