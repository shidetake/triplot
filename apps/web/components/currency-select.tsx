"use client";

import { useState } from "react";

import { Select } from "@base-ui/react/select";

import {
  ALL_CURRENCIES,
  COMMON_CURRENCIES,
  currencyLabel,
} from "@triplot/shared/currencies";
import { CheckIcon, ChevronIcon } from "./icons";
import { inputClass } from "./input-class";
import { NarrowSheet } from "./form-popover";
import { menuItemClass } from "./menu-item";
import { useMediaQuery } from "./use-media-query";

// 通貨選択。trigger にはコード3文字のみ（"USD"）、popup にはフルラベル（"USD – 米ドル"）を出す。
// native <select> はトリガとオプションで異なるテキストを出せないため Base UI Select を使う
// （ui-guidelines「部品の作り方」step2）。
// Select.Root の name で hidden input が自動生成されフォーム送信される。
export function CurrencySelect({
  name,
  value,
  onChange,
  id,
  className,
  "aria-label": ariaLabel,
}: {
  name: string;
  value: string;
  onChange: (code: string) => void;
  // <label htmlFor> と紐付けるための id（オプション）。
  id?: string;
  // trigger に追加するレイアウトクラス（例: "mt-1 w-full"）。
  className?: string;
  // 可視ラベル無しで使うときのアクセシブル名。
  "aria-label"?: string;
}) {
  // 狭い画面はボトムシート（iOS の通貨ピッカーと同じ）。フォーム自体がシートで
  // 開いている中からさらに開くので、シートの入れ子になる。
  const narrow = useMediaQuery("(max-width: 639px)");
  const [sheetOpen, setSheetOpen] = useState(false);

  if (narrow) {
    return (
      <>
        {/* フォーム送信に載せるための hidden input（Select.Root が自動生成して
            いたものを、シート版では自前で持つ）。 */}
        <input type="hidden" name={name} value={value} />
        <button
          type="button"
          id={id}
          aria-label={ariaLabel}
          onClick={() => setSheetOpen(true)}
          className={`flex items-center gap-1.5 text-left ${inputClass} ${className ?? ""}`}
        >
          <span className="min-w-0 flex-1 tabular-nums">{value}</span>
          <ChevronIcon
            size={16}
            className="shrink-0 rotate-90 text-subtle-foreground"
          />
        </button>
        {sheetOpen && (
          <NarrowSheet
            label={ariaLabel ?? "通貨"}
            onClose={() => setSheetOpen(false)}
          >
            <div className="pb-2 text-sm">
              <SheetGroup label="主要通貨">
                {COMMON_CURRENCIES.map((c) => (
                  <SheetOption
                    key={c}
                    code={c}
                    selected={c === value}
                    onSelect={() => {
                      onChange(c);
                      setSheetOpen(false);
                    }}
                  />
                ))}
              </SheetGroup>
              <div className="my-1 border-t border-foreground/10" />
              <SheetGroup label="その他">
                {ALL_CURRENCIES.filter(
                  (c) => !COMMON_CURRENCIES.includes(c),
                ).map((c) => (
                  <SheetOption
                    key={c}
                    code={c}
                    selected={c === value}
                    onSelect={() => {
                      onChange(c);
                      setSheetOpen(false);
                    }}
                  />
                ))}
              </SheetGroup>
            </div>
          </NarrowSheet>
        )}
      </>
    );
  }

  return (
    <Select.Root
      name={name}
      value={value}
      onValueChange={(v) => onChange((v as string | null) ?? value)}
    >
      <Select.Trigger
        id={id}
        aria-label={ariaLabel}
        className={`flex items-center gap-1.5 text-left ${inputClass} group ${className ?? ""}`}
      >
        <Select.Value className="tabular-nums">
          {(val) => (val as string) || value}
        </Select.Value>
        <Select.Icon className="shrink-0 text-subtle-foreground">
          <ChevronIcon
            size={16}
            className="rotate-90 transition group-aria-expanded:rotate-[-90deg]"
          />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Positioner
          className="z-50"
          sideOffset={4}
          alignItemWithTrigger={false}
        >
          <Select.Popup className="max-h-64 min-w-[16rem] overflow-y-auto rounded-md border border-foreground/20 bg-background py-1 shadow-lg outline-none">
            <Select.Group>
              <Select.GroupLabel className="px-3 pb-0.5 pt-1 text-xs font-medium text-muted-foreground">
                主要通貨
              </Select.GroupLabel>
              {COMMON_CURRENCIES.map((c) => (
                <CurrencyOption key={c} code={c} />
              ))}
            </Select.Group>
            <div className="my-1 border-t border-foreground/10" />
            <Select.Group>
              <Select.GroupLabel className="px-3 pb-0.5 pt-1 text-xs font-medium text-muted-foreground">
                その他
              </Select.GroupLabel>
              {ALL_CURRENCIES.filter((c) => !COMMON_CURRENCIES.includes(c)).map(
                (c) => (
                  <CurrencyOption key={c} code={c} />
                ),
              )}
            </Select.Group>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

// 狭い画面のシート版の行（見た目はドロップダウンの行と同じ menuItemClass）。
function SheetGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="px-3 pb-0.5 pt-1 text-xs font-medium text-muted-foreground">
        {label}
      </div>
      {children}
    </>
  );
}

function SheetOption({
  code,
  selected,
  onSelect,
}: {
  code: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-2 ${menuItemClass} ${selected ? "bg-accent font-medium" : ""}`}
    >
      <span className="min-w-0 flex-1 truncate text-left tabular-nums">
        {currencyLabel(code)}
      </span>
      {selected && (
        <CheckIcon size={16} className="shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}

function CurrencyOption({ code }: { code: string }) {
  return (
    <Select.Item
      value={code}
      className={`flex items-center gap-2 ${menuItemClass} data-[selected]:bg-accent data-[selected]:font-medium`}
    >
      <Select.ItemText className="min-w-0 flex-1 truncate tabular-nums">
        {currencyLabel(code)}
      </Select.ItemText>
      <Select.ItemIndicator className="shrink-0 text-muted-foreground">
        <CheckIcon size={16} />
      </Select.ItemIndicator>
    </Select.Item>
  );
}
