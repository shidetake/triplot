"use client";

import { useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";

// 時・分を縦スクロールのボタン列（ドラム/ホイール風）で選ぶ時刻コントロール（"HH:MM"）。
// native <input type=time> / <select> は iOS Safari のオーバーレイ内でタップしても OS
// ピッカーが開かないため使わない。中身は純粋な <button>（カレンダーと同じ）＝どの環境でも
// 確実にタップで変えられる。スクロールは無限ループ: 23 の次に 0、55 の次に 0 へ巻き戻す
// （複製を並べ、端に近づいたら中央バンドへ scrollTop を瞬間リセットして錯覚させる）。
// 分は 5 分刻み。既存値が刻み外（取り込み等の 09:07 等）ならその値も選択肢に含める。
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTE_STEP = 5;
const pad = (n: number) => String(n).padStart(2, "0");

const ITEM_H = 32; // 各行の高さ(px)
const VISIBLE = 3; // 同時に見える行数（縦幅 = VISIBLE * ITEM_H）
const COPIES = 9; // 無限ループ用の複製数（奇数。中央コピーを基準に上下へバッファ）
const CENTER_OFFSET = ((VISIBLE - 1) / 2) * ITEM_H; // 選択行を中央に置く上オフセット

function Wheel({
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
  const ref = useRef<HTMLDivElement>(null);
  const len = values.length;
  const cycle = len * ITEM_H;
  const selIndex = Math.max(0, values.indexOf(selected));

  // 開いた時、中央コピーの選択行を中央へ。
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mid = Math.floor(COPIES / 2);
    el.scrollTop = (mid * len + selIndex) * ITEM_H - CENTER_OFFSET;
    // マウント時のみ。スクロール中の値変更で再センタリングするとガタつくので deps は空。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    // 端に近づいたら中央バンドへ巻き戻す（複製ぶんジャンプ＝見た目は連続）。
    if (el.scrollTop < cycle) el.scrollTop += cycle * (COPIES - 2);
    else if (el.scrollTop > cycle * (COPIES - 1))
      el.scrollTop -= cycle * (COPIES - 2);
  };

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      role="listbox"
      aria-label={label}
      className="w-14 overflow-y-auto overscroll-contain rounded-md border border-foreground/20"
      style={{ height: VISIBLE * ITEM_H }}
    >
      {Array.from({ length: COPIES * len }, (_, i) => {
        const v = values[i % len];
        const on = v === selected;
        return (
          <button
            key={i}
            type="button"
            role="option"
            aria-selected={on}
            onClick={() => onPick(v)}
            className={cn(
              "block w-full text-center text-sm tabular-nums transition",
              on
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:bg-foreground/10",
            )}
            style={{ height: ITEM_H, lineHeight: `${ITEM_H}px` }}
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
      <Wheel
        values={HOURS}
        selected={hh}
        onPick={(h) => onChange(`${pad(h)}:${pad(mm)}`)}
        label="時"
      />
      <span className="self-center text-muted-foreground">:</span>
      <Wheel
        values={minutes}
        selected={mm}
        onPick={(m) => onChange(`${pad(hh)}:${pad(m)}`)}
        label="分"
      />
    </div>
  );
}
