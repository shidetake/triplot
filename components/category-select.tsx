"use client";

import { useEffect, useRef, useState } from "react";

import type { Category } from "./expense-form";
import { ExpenseCategoryIcon } from "./expense-category-icon";
import { CheckIcon, ChevronIcon } from "./icons";

// 費用カテゴリの選択。native <select> は <option> に SVG を描けないため、
// MS ピクト＋名前を出せる軽量カスタムドロップダウンにしている。見た目は
// 費用リストのチップ（色丸＋白アイコン）と揃える。選択値は hidden input
// （name）でフォーム送信する。
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = categories.find((c) => c.id === value);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative mt-1">
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-left focus:border-black focus:outline-none"
      >
        {selected && <CategoryChip category={selected} />}
        <span className="min-w-0 flex-1 truncate">
          {selected?.name ?? "選択してください"}
        </span>
        <ChevronIcon
          size={16}
          className={`shrink-0 text-zinc-400 transition-transform ${
            open ? "-rotate-90" : "rotate-90"
          }`}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-zinc-300 bg-white py-1 shadow-lg"
        >
          {categories.map((c) => {
            const isSel = c.id === value;
            return (
              <li key={c.id} role="option" aria-selected={isSel}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50 ${
                    isSel ? "bg-zinc-50 font-medium" : ""
                  }`}
                >
                  <CategoryChip category={c} />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {isSel && (
                    <CheckIcon size={14} className="shrink-0 text-zinc-500" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
