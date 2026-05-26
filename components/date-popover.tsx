"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import type { Matcher } from "react-day-picker";

import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// 年プルダウン（captionLayout="dropdown-years"）の選択肢範囲＝カレンダーの
// ＜ ＞ ナビが動ける範囲。今日から±10年。旅行プランの文脈では十分。
const TODAY = new Date();
const RANGE_START = new Date(TODAY.getFullYear() - 10, 0, 1);
const RANGE_END = new Date(TODAY.getFullYear() + 10, 11, 1);

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

// 単発の日付選択ポップオーバー。タップでカレンダーが開く。フォーム送信は
// hidden input(name) で "YYYY-MM-DD" を流す。tripStart/tripEnd を渡すと
// その日程をカレンダー上で薄い背景色でハイライトする（旅行外も選択可）。
// disabled は rdp の Matcher をそのまま転送。「終了日は開始日より前不可」など
// 不正状態を picker レベルで物理的に弾くために使う（呼び出し側でセット）。
export function DatePopover({
  name,
  value,
  onChange,
  required,
  tripStart,
  tripEnd,
  disabled,
  className,
}: {
  name: string;
  value: string; // "YYYY-MM-DD" or ""
  onChange: (v: string) => void;
  required?: boolean;
  tripStart?: string | null;
  tripEnd?: string | null;
  disabled?: Matcher | Matcher[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const date = parseYmd(value);
  const tripFrom = parseYmd(tripStart);
  const tripTo = parseYmd(tripEnd);

  return (
    <>
      <input type="hidden" name={name} value={value} required={required} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            "flex w-full min-w-0 items-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none",
            className,
          )}
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-left",
              date ? "text-zinc-900" : "text-zinc-400",
            )}
          >
            {date
              ? format(date, "yyyy/M/d (EEE)", { locale: ja })
              : "日付を選択"}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => {
              if (d) {
                onChange(fmtYmd(d));
                setOpen(false);
              }
            }}
            defaultMonth={date ?? tripFrom ?? new Date()}
            locale={ja}
            captionLayout="dropdown-years"
            startMonth={RANGE_START}
            endMonth={RANGE_END}
            disabled={disabled}
            modifiers={
              tripFrom && tripTo ? { trip: { from: tripFrom, to: tripTo } } : undefined
            }
            modifiersClassNames={{ trip: "bg-blue-50" }}
          />
        </PopoverContent>
      </Popover>
    </>
  );
}
