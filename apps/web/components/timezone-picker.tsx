"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Popover } from "@base-ui/react/popover";

import { TZ_GROUPS, tzDisplayLabel } from "@triplot/shared/timezones";

import { CheckIcon, ChevronIcon } from "./icons";
import { inputClass } from "./input-class";
import { NarrowSheet } from "./form-popover";
import { menuItemClass } from "./menu-item";
import { useMediaQuery } from "./use-media-query";

export function useTzLabel(): (iana: string) => string {
  return tzDisplayLabel;
}

export function TimezonePicker({
  name,
  value,
  onChange,
}: {
  name?: string;
  value: string;
  onChange: (iana: string) => void;
}) {
  const t = useTranslations("event");
  // 狭い画面はボトムシート（iOS のタイムゾーンピッカーと同じ）。閾値は FormPopover と同じ。
  const narrow = useMediaQuery("(max-width: 639px)");
  const [open, setOpen] = useState(false);
  const [groupLabel, setGroupLabel] = useState<string | null>(null);
  const [subGroupLabel, setSubGroupLabel] = useState<string | null>(null);

  const group = TZ_GROUPS.find((g) => g.label === groupLabel) ?? null;
  const subGroup =
    group?.subGroups.find((sg) => sg.label === subGroupLabel) ?? null;
  const label = tzDisplayLabel(value);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setGroupLabel(null);
      setSubGroupLabel(null);
    }
  };

  const body = (
    <>
      {!group ? (
        // Step 1: 大陸グループ一覧
        TZ_GROUPS.map((g) => (
          <button
            key={g.label}
            type="button"
            onClick={() => setGroupLabel(g.label)}
            className={`flex items-center justify-between gap-2 ${menuItemClass}`}
          >
            <span>{g.label}</span>
            <ChevronIcon
              size={16}
              className="shrink-0 rotate-90 text-subtle-foreground"
            />
          </button>
        ))
      ) : !subGroup ? (
        // Step 2: サブ地域一覧
        <>
          <button
            type="button"
            onClick={() => setGroupLabel(null)}
            className={`flex items-center gap-2 border-b border-foreground/10 font-medium ${menuItemClass}`}
          >
            <ChevronIcon
              size={16}
              className="-rotate-90 text-muted-foreground"
            />
            <span>{group.label}</span>
          </button>
          {group.subGroups.map((sg) => (
            <button
              key={sg.label}
              type="button"
              onClick={() => setSubGroupLabel(sg.label)}
              className={`flex items-center justify-between gap-2 ${menuItemClass}`}
            >
              <span>{sg.label}</span>
              <ChevronIcon
                size={16}
                className="shrink-0 rotate-90 text-subtle-foreground"
              />
            </button>
          ))}
        </>
      ) : (
        // Step 3: ゾーン一覧
        <>
          <button
            type="button"
            onClick={() => setSubGroupLabel(null)}
            className={`flex items-center gap-2 border-b border-foreground/10 font-medium ${menuItemClass}`}
          >
            <ChevronIcon
              size={16}
              className="-rotate-90 text-muted-foreground"
            />
            <span>{subGroup.label}</span>
          </button>
          {subGroup.zones.map((zone) => (
            <button
              key={zone.iana}
              type="button"
              onClick={() => {
                onChange(zone.iana);
                setOpen(false);
              }}
              className={`flex items-center justify-between gap-2 ${menuItemClass} ${
                zone.iana === value ? "bg-accent font-medium" : ""
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{zone.name}</span>
                {zone.sub && (
                  <span className="block truncate text-xs font-normal text-muted-foreground">
                    {zone.sub}
                  </span>
                )}
              </span>
              {zone.iana === value && (
                <CheckIcon
                  size={16}
                  className="shrink-0 text-muted-foreground"
                />
              )}
            </button>
          ))}
        </>
      )}
    </>
  );

  // 狭い画面はボトムシート（iOS のタイムゾーンピッカーと同じ）。予定フォーム自体が
  // シートで開いている中からさらに開くので、シートの入れ子になる。
  if (narrow) {
    return (
      <>
        {name && <input type="hidden" name={name} value={value} />}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`flex w-full items-center justify-between gap-2 text-left ${inputClass}`}
        >
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <ChevronIcon
            size={16}
            className="shrink-0 rotate-90 text-subtle-foreground"
          />
        </button>
        {open && (
          <NarrowSheet
            label={t("timezonePickerTitle")}
            onClose={() => handleOpenChange(false)}
          >
            <div className="pb-2 text-sm">{body}</div>
          </NarrowSheet>
        )}
      </>
    );
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <Popover.Root open={open} onOpenChange={handleOpenChange} modal={false}>
        <Popover.Trigger
          type="button"
          className={`flex w-full items-center justify-between gap-2 text-left ${inputClass} group`}
        >
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <ChevronIcon
            size={16}
            className="shrink-0 rotate-90 text-subtle-foreground transition group-aria-expanded:rotate-[-90deg]"
          />
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Positioner sideOffset={4} className="z-50">
            <Popover.Popup className="max-h-64 w-[var(--anchor-width)] min-w-[22rem] overflow-y-auto rounded-md border border-foreground/20 bg-background py-1 shadow-lg outline-none">
              {body}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}
