"use client";

import { Select } from "@base-ui/react/select";

import {
  ALL_CURRENCIES,
  COMMON_CURRENCIES,
  currencyLabel,
} from "@triplot/shared/currencies";
import { CheckIcon, ChevronIcon } from "./icons";
import { inputClass } from "./input-class";
import { menuItemClass } from "./menu-item";

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
}: {
  name: string;
  value: string;
  onChange: (code: string) => void;
  // <label htmlFor> と紐付けるための id（オプション）。
  id?: string;
  // trigger に追加するレイアウトクラス（例: "mt-1 w-full"）。
  className?: string;
}) {
  return (
    <Select.Root
      name={name}
      value={value}
      onValueChange={(v) => onChange((v as string | null) ?? value)}
    >
      <Select.Trigger
        id={id}
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
