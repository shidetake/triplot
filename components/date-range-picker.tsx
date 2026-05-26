"use client";

import { useState } from "react";
import { ja } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

import { Calendar } from "@/components/ui/calendar";

// "YYYY-MM-DD" ↔ Date（ローカル日付として無TZで扱う）
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

// 旅行作成フォームの日程選択。常時表示の範囲カレンダー。フォーム送信は
// hidden input に "YYYY-MM-DD" を流す。
export function DateRangePicker({
  startName,
  endName,
  defaultStart,
  defaultEnd,
}: {
  startName: string;
  endName: string;
  defaultStart?: string | null;
  defaultEnd?: string | null;
}) {
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const from = parseYmd(defaultStart);
    const to = parseYmd(defaultEnd);
    return from || to ? { from, to } : undefined;
  });
  return (
    <div className="rounded-md border border-zinc-300 bg-white p-2">
      <input type="hidden" name={startName} value={fmtYmd(range?.from)} />
      <input type="hidden" name={endName} value={fmtYmd(range?.to)} />
      <Calendar
        mode="range"
        selected={range}
        onSelect={setRange}
        defaultMonth={range?.from ?? new Date()}
        locale={ja}
      />
    </div>
  );
}
