"use client";

import { useTranslations } from "next-intl";
import { Select } from "@base-ui/react/select";

import type { Category } from "./expense-form";
import { inputClass } from "./input-class";
import { ExpenseCategoryIcon } from "./expense-category-icon";
import { CheckIcon, ChevronIcon } from "./icons";
import { menuItemClass } from "./menu-item";

// 費用カテゴリの選択。native <select> は <option> に SVG を描けないため、Base UI の
// Select（ui-guidelines「部品の作り方」step2＝native で出せない中身は shadcn/Base UI を使う）
// で MS ピクト＋名前を出す。トリガは inputClass、候補行は menuItemClass で他のドロップダウンと揃える。
// 選択値は Select.Root の name で hidden input が自動生成されフォーム送信される。
export function CategorySelect({
  name,
  categories,
  value,
  onChange,
}: {
  name: string;
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
}) {
  const t = useTranslations("common");
  const tExp = useTranslations("expense");

  return (
    <Select.Root
      name={name}
      value={value}
      onValueChange={(v) => onChange((v as string | null) ?? "")}
    >
      <Select.Trigger
        className={`mt-1 flex w-full items-center gap-2 text-left ${inputClass}`}
      >
        <Select.Value>
          {(val) => {
            const c = categories.find((x) => x.id === val);
            const catName = c ? (c.key ? tExp(`cat.${c.key}`) : c.name) : null;
            return (
              <span className="flex min-w-0 flex-1 items-center gap-2">
                {c && <CategoryChip category={c} />}
                <span className="min-w-0 flex-1 truncate">
                  {catName ?? t("pleaseSelect")}
                </span>
              </span>
            );
          }}
        </Select.Value>
        <Select.Icon className="shrink-0 text-subtle-foreground">
          <ChevronIcon size={16} className="rotate-90" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Positioner
          className="z-50"
          sideOffset={4}
          alignItemWithTrigger={false}
        >
          <Select.Popup className="max-h-64 w-[var(--anchor-width)] overflow-y-auto rounded-md border border-foreground/20 bg-white py-1 shadow-lg">
            {categories.map((c) => (
              <Select.Item
                key={c.id}
                value={c.id}
                className={`flex items-center gap-2 ${menuItemClass} data-[selected]:bg-accent data-[selected]:font-medium`}
              >
                <CategoryChip category={c} />
                <Select.ItemText className="min-w-0 flex-1 truncate">
                  {c.key ? tExp(`cat.${c.key}`) : c.name}
                </Select.ItemText>
                <Select.ItemIndicator className="shrink-0 text-muted-foreground">
                  <CheckIcon size={16} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

function CategoryChip({ category }: { category: Category }) {
  // svg を丸いっぱい(20px)に描き、余白は inset で SVG 内側に作る。CSS の flex
  // 中央寄せを使わないので、エンジン/DPR をまたいでもサブピクセルのズレが出ない。
  return (
    <span
      className="block h-5 w-5 shrink-0 rounded-full text-white"
      style={{ backgroundColor: category.color }}
    >
      <ExpenseCategoryIcon icon={category.icon} size={20} inset={0.18} />
    </span>
  );
}
