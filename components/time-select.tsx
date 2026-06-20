"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

// 時・分を「ただのボタン列（縦スクロール選択）」で選ぶ時刻コントロール（"HH:MM"）。
// なぜ native <input type=time> / <select> を使わないか:
//   iOS Safari ではこれらがポップオーバー（オーバーレイ）内だとタップしても OS ピッカーが
//   開かず時刻を変えられない。カレンダー(react-day-picker)が動くのは中身が「ただの button」
//   だから。ここも同じく純粋な button にして、ネイティブピッカー依存を断つ＝どの環境でも
//   確実にタップで変えられる。見た目はドラム/ホイール風（選択行をハイライト・中央へスクロール）。
// 分は 5 分刻み。既存値が刻み外（取り込み等の 09:07 等）ならその値も選択肢に含める。
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTE_STEP = 5;
const pad = (n: number) => String(n).padStart(2, "0");

function Column({
  values,
  selected,
  onPick,
  label,
}: {
  values: number[];
  selected: number;
  onPick: (v: number) => void;
  label: string;
}) {
  const selRef = useRef<HTMLButtonElement>(null);
  // 開いた時・選択が変わった時、選択行を見える位置（中央）へ。
  useEffect(() => {
    selRef.current?.scrollIntoView({ block: "center" });
  }, [selected]);

  return (
    <div
      role="listbox"
      aria-label={label}
      className="h-36 w-14 overflow-y-auto overscroll-contain rounded-md border border-foreground/20"
    >
      {values.map((v) => {
        const on = v === selected;
        return (
          <button
            key={v}
            ref={on ? selRef : undefined}
            type="button"
            role="option"
            aria-selected={on}
            onClick={() => onPick(v)}
            className={cn(
              "block w-full py-1.5 text-center text-sm tabular-nums transition",
              on
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:bg-foreground/10",
            )}
          >
            {pad(v)}
          </button>
        );
      })}
    </div>
  );
}

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
  if (!minutes.includes(mm)) {
    minutes.push(mm);
    minutes.sort((a, b) => a - b);
  }

  return (
    <div className={cn("flex items-stretch gap-1", className)}>
      <Column
        values={HOURS}
        selected={hh}
        onPick={(h) => onChange(`${pad(h)}:${pad(mm)}`)}
        label="時"
      />
      <span className="self-center text-muted-foreground">:</span>
      <Column
        values={minutes}
        selected={mm}
        onPick={(m) => onChange(`${pad(hh)}:${pad(m)}`)}
        label="分"
      />
    </div>
  );
}
