"use client";

import { useTranslations } from "next-intl";

import { Menu } from "@base-ui/react/menu";

import { formatDayLabel } from "@triplot/shared/schedule";
import type {
  AreaFilterOption,
  DayFilterOption,
  PlaceFilter,
} from "@triplot/shared/placeFilter";

import { CheckIcon, FilterIcon } from "./icons";
import { menuItemClass } from "./menu-item";
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

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            type="button"
            variant={active ? "primary" : "outline"}
            size="icon"
            aria-label={t("filterAria", { label })}
            title={t("filterAria", { label })}
            className="shrink-0 bg-background data-[active]:bg-primary"
          >
            <FilterIcon size={18} />
          </Button>
        }
      />
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={8} className="z-50">
          <Menu.Popup className="max-h-64 w-56 overflow-y-auto rounded-md border border-foreground/10 bg-background py-1 text-sm shadow-lg">
            <Menu.Item
              onClick={() => onChange(null)}
              className={`flex items-center gap-2 ${menuItemClass} ${
                filter ? "" : "bg-accent font-medium"
              }`}
            >
              <span className="flex-1">{t("filterAll")}</span>
              {!filter && <CheckIcon size={16} />}
            </Menu.Item>

            {areaOptions.length > 0 && (
              <>
                <div className="px-3 pb-1 pt-2 text-xs text-muted-foreground">
                  {t("filterSectionArea")}
                </div>
                {areaOptions.map(({ label: areaLabel, count }) => {
                  const selected =
                    filter?.kind === "area" && filter.label === areaLabel;
                  return (
                    <Menu.Item
                      key={`area:${areaLabel ?? ""}`}
                      onClick={() => onChange({ kind: "area", label: areaLabel })}
                      className={`flex items-center gap-2 ${menuItemClass} ${
                        selected ? "bg-accent font-medium" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {areaLabel ?? t("other")}
                      </span>
                      <span className="tabular-nums text-xs text-muted-foreground">
                        {count}
                      </span>
                      {selected && <CheckIcon size={16} />}
                    </Menu.Item>
                  );
                })}
              </>
            )}

            {dayOptions.length > 0 && (
              <>
                <div className="px-3 pb-1 pt-2 text-xs text-muted-foreground">
                  {t("filterSectionDay")}
                </div>
                {dayOptions.map((d) => {
                  const selected =
                    filter?.kind === "day" && filter.dayIndex === d.dayIndex;
                  return (
                    <Menu.Item
                      key={`day:${d.dayIndex}`}
                      onClick={() =>
                        onChange({ kind: "day", dayIndex: d.dayIndex })
                      }
                      className={`flex items-center gap-2 ${menuItemClass} ${
                        selected ? "bg-accent font-medium" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {dayLabel(d)}
                      </span>
                      <span className="tabular-nums text-xs text-muted-foreground">
                        {d.count}
                      </span>
                      {selected && <CheckIcon size={16} />}
                    </Menu.Item>
                  );
                })}
              </>
            )}

            {dismissedCount > 0 && (
              <>
                <div className="px-3 pb-1 pt-2 text-xs text-muted-foreground">
                  {t("filterSectionOther")}
                </div>
                <Menu.Item
                  closeOnClick={false}
                  onClick={onToggleDismissed}
                  className={`flex items-center gap-2 ${menuItemClass} ${
                    showDismissed ? "bg-accent font-medium" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    {t("filterShowDismissed")}
                  </span>
                  <span className="tabular-nums text-xs text-muted-foreground">
                    {dismissedCount}
                  </span>
                  {showDismissed && <CheckIcon size={16} />}
                </Menu.Item>
              </>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
