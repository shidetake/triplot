"use client";

import { useMemo, useState } from "react";

import { ChevronIcon } from "./icons";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(y: number, m0: number, d: number): string {
  return `${y}-${pad(m0 + 1)}-${pad(d)}`;
}

function parseYmd(s: string | null | undefined): {
  y: number;
  m0: number;
  d: number;
} | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return { y: Number(m[1]), m0: Number(m[2]) - 1, d: Number(m[3]) };
}

// 区間（開始日〜終了日）を一気に選ぶカレンダー。
// 1回目クリックで開始日、2回目で終了日（開始より前なら開始を置き直す）。
// 値は hidden input（startName / endName）に YYYY-MM-DD で載るので、
// 既存のサーバアクション側はそのまま動く。
export function DateRangeCalendar({
  startName,
  endName,
  initialStart,
  initialEnd,
}: {
  startName: string;
  endName: string;
  initialStart?: string | null;
  initialEnd?: string | null;
}) {
  const [start, setStart] = useState<string | null>(initialStart ?? null);
  const [end, setEnd] = useState<string | null>(initialEnd ?? null);

  const today = new Date();
  const firstView =
    parseYmd(initialStart) ??
    ({ y: today.getFullYear(), m0: today.getMonth(), d: 1 } as const);
  const [view, setView] = useState({ y: firstView.y, m0: firstView.m0 });

  const grid = useMemo(() => {
    const firstWeekday = new Date(view.y, view.m0, 1).getDay();
    const daysInMonth = new Date(view.y, view.m0 + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [view]);

  function pick(d: number) {
    const v = ymd(view.y, view.m0, d);
    if (!start || (start && end)) {
      setStart(v);
      setEnd(null);
    } else if (v < start) {
      setStart(v);
      setEnd(null);
    } else {
      setEnd(v);
    }
  }

  function clear() {
    setStart(null);
    setEnd(null);
  }

  function shiftMonth(delta: number) {
    const m = view.m0 + delta;
    setView({
      y: view.y + Math.floor(m / 12),
      m0: ((m % 12) + 12) % 12,
    });
  }

  return (
    <div className="rounded-md border border-zinc-300 bg-white p-3">
      <input type="hidden" name={startName} value={start ?? ""} />
      <input type="hidden" name={endName} value={end ?? ""} />

      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="前の月"
          className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
        >
          <ChevronIcon size={18} className="rotate-180" />
        </button>
        <div className="text-sm font-semibold text-zinc-900">
          {view.y}年{view.m0 + 1}月
        </div>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="次の月"
          className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
        >
          <ChevronIcon size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] text-zinc-500">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {grid.map((d, i) => {
          if (d === null) return <div key={`b${i}`} className="h-9" />;
          const v = ymd(view.y, view.m0, d);
          const isStart = v === start;
          const isEnd = v === end;
          const inRange =
            !!start && !!end && v > start && v < end ? true : false;
          const hasRange = !!start && !!end && start !== end;
          const isEdge = isStart || isEnd;

          // 区間の帯（薄い青）。開始セルは右半分、終了セルは左半分だけ塗る。
          let band: string | null = null;
          if (hasRange && inRange) band = "inset-x-0";
          else if (hasRange && isStart) band = "left-1/2 right-0 rounded-l-full";
          else if (hasRange && isEnd) band = "left-0 right-1/2 rounded-r-full";

          return (
            <button
              key={v}
              type="button"
              onClick={() => pick(d)}
              className="relative flex h-9 items-center justify-center text-sm"
            >
              {band && (
                <span
                  className={`pointer-events-none absolute inset-y-1 bg-blue-50 ${band}`}
                />
              )}
              <span
                className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full ${
                  isEdge
                    ? "bg-blue-600 font-semibold text-white"
                    : "text-zinc-800 hover:bg-zinc-100"
                }`}
              >
                {d}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
        <span>
          {start ? start : "開始日"} 〜 {end ? end : "終了日"}
        </span>
        {(start || end) && (
          <button
            type="button"
            onClick={clear}
            className="text-zinc-400 hover:text-zinc-700"
          >
            クリア
          </button>
        )}
      </div>
    </div>
  );
}
