"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { useDayPicker, type MonthCaptionProps } from "react-day-picker";

import { cn } from "@/lib/utils";

// 年ドロップダウンの範囲。今日から±10年。旅行プランには十分。
const TODAY = new Date();
const YEAR_FROM = TODAY.getFullYear() - 10;
const YEAR_TO = TODAY.getFullYear() + 10;
const YEARS = Array.from(
  { length: YEAR_TO - YEAR_FROM + 1 },
  (_, i) => YEAR_FROM + i,
);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

// react-day-picker の月見出しを置き換える。「YYYY年M月 ▽」を1つのボタンに
// まとめて、タップで年/月を同時に選べる小パネルを出す。組み込みの「年▽ + 月▽」
// 二段ドロップダウン（chevron が散る見た目）の代替で、離れた日付への素早い
// ジャンプを実現する。パネルは absolute(非portal) でレンダリングして、外側の
// DatePopover との二重ポップオーバーの相性問題を回避。
export function CustomMonthCaption({
  calendarMonth,
  displayIndex,
  className,
  ...rest
}: MonthCaptionProps) {
  // displayIndex は使わないが props から外して DOM へ流れないようにする。
  void displayIndex;
  const { goToMonth } = useDayPicker();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const currentYearRef = useRef<HTMLButtonElement>(null);
  const date = calendarMonth.date;
  const y = date.getFullYear();
  const m = date.getMonth() + 1;

  // 外側クリック / Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 開いた時に現在年へスクロール
  useEffect(() => {
    if (open && currentYearRef.current) {
      currentYearRef.current.scrollIntoView({
        block: "center",
        behavior: "instant" as ScrollBehavior,
      });
    }
  }, [open]);

  return (
    <div
      ref={wrapRef}
      {...rest}
      className={cn("relative flex items-center justify-center", className)}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium hover:bg-accent"
      >
        <span>
          {y}年{m}月
        </span>
        <ChevronDownIcon className="size-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 rounded-lg border border-zinc-200 bg-popover p-2 shadow-md">
          <div className="flex gap-2">
            <ul className="max-h-56 w-20 overflow-y-auto border-r border-zinc-200 pr-2">
              {YEARS.map((yr) => (
                <li key={yr}>
                  <button
                    type="button"
                    ref={yr === y ? currentYearRef : undefined}
                    onClick={() => goToMonth(new Date(yr, m - 1, 1))}
                    className={cn(
                      "block w-full rounded px-2 py-1 text-left text-sm hover:bg-accent",
                      yr === y && "bg-accent font-medium",
                    )}
                  >
                    {yr}年
                  </button>
                </li>
              ))}
            </ul>
            <ul className="grid grid-cols-3 gap-1">
              {MONTHS.map((mo) => (
                <li key={mo}>
                  <button
                    type="button"
                    onClick={() => {
                      goToMonth(new Date(y, mo - 1, 1));
                      setOpen(false);
                    }}
                    className={cn(
                      "block w-12 rounded px-2 py-1 text-sm hover:bg-accent",
                      mo === m && "bg-accent font-medium",
                    )}
                  >
                    {mo}月
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
