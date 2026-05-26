"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function parseYmd(s?: string | null): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}
function fmtYmd(d?: Date): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// 範囲日付のポップオーバー。トリガーをタップ → カレンダーが popover で開き、
// 範囲（from, to）を選ぶ。両方選び終わると自動で閉じる。フォーム送信は2つの
// hidden input（startName / endName）に "YYYY-MM-DD" を流す。
// 旅行作成フォームの「日程」用。挙動は予定フォームの DatePopover と同方式。
export function DateRangePopover({
  startName,
  endName,
  defaultStart,
  defaultEnd,
  required,
}: {
  startName: string;
  endName: string;
  defaultStart?: string | null;
  defaultEnd?: string | null;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const from = parseYmd(defaultStart);
    const to = parseYmd(defaultEnd);
    return from || to ? { from, to } : undefined;
  });

  const f = range?.from;
  const t = range?.to;
  const label =
    f && t
      ? `${format(f, "yyyy/M/d (EEE)", { locale: ja })} 〜 ${format(t, "M/d (EEE)", { locale: ja })}`
      : f
        ? `${format(f, "yyyy/M/d (EEE)", { locale: ja })} 〜 ?`
        : "日程を選択";

  return (
    <>
      <input
        type="hidden"
        name={startName}
        value={fmtYmd(f)}
        required={required}
      />
      <input
        type="hidden"
        name={endName}
        value={fmtYmd(t)}
        required={required}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            "flex w-full min-w-0 items-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none",
          )}
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-left",
              f || t ? "text-zinc-900" : "text-zinc-400",
            )}
          >
            {label}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={range}
            onSelect={(r) => {
              setRange(r);
              // 範囲が確定したら閉じる（片方だけのときは開いたまま）。
              // min=1 を渡すことで「初回クリックで from=to=d として確定扱い」
              // になる v10 既定の挙動を抑え、初回クリックは to=undefined にする。
              if (r?.from && r?.to) setOpen(false);
            }}
            defaultMonth={range?.from ?? new Date()}
            locale={ja}
            min={1}
          />
        </PopoverContent>
      </Popover>
    </>
  );
}
