"use client";

import { cn } from "@/lib/utils";

import { inputClass } from "./input-class";

// 時・分を native <select> 2 つで選ぶ時刻コントロール（"HH:MM"）。
// native time input は iOS Safari で appearance:none だとタップしても OS ピッカーが
// 開かない癖があるため、確実に動く native select に寄せる（iOS は select タップで
// ホイールが出る／その場で直接変えられる＝design-guidelines「1b: 素の選択は native select」）。
// 分は 5 分刻み。既存値が刻み外（取り込み等で 09:07 等）なら、その値も選択肢に含める。
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTE_STEP = 5;
const pad = (n: number) => String(n).padStart(2, "0");

export function TimeSelect({
  value,
  onChange,
  className,
}: {
  value: string; // "HH:MM"
  onChange: (v: string) => void;
  className?: string;
}) {
  const [hh, mm] = value.split(":").map(Number);

  const minutes: number[] = [];
  for (let m = 0; m < 60; m += MINUTE_STEP) minutes.push(m);
  if (!minutes.includes(mm)) minutes.push(mm);
  minutes.sort((a, b) => a - b);

  const set = (h: number, m: number) => onChange(`${pad(h)}:${pad(m)}`);

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <select
        aria-label="時"
        value={hh}
        onChange={(e) => set(Number(e.target.value), mm)}
        className={cn("px-2", inputClass)}
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {pad(h)}
          </option>
        ))}
      </select>
      <span className="text-muted-foreground">:</span>
      <select
        aria-label="分"
        value={mm}
        onChange={(e) => set(hh, Number(e.target.value))}
        className={cn("px-2", inputClass)}
      >
        {minutes.map((m) => (
          <option key={m} value={m}>
            {pad(m)}
          </option>
        ))}
      </select>
    </div>
  );
}
