"use client";

import { useEffect, useMemo, useRef } from "react";

import type { Schedule, ScheduleEvent } from "@/lib/schedule";

const GUTTER = 48; // 時刻ガター幅 px
const HOUR_PX = 48; // 1時間の高さ px
const ALLDAY_ROW = 22; // 終日バー1行の高さ px
const MIN_BLOCK = 20; // イベントブロックの最低高さ px

export type Anchor = { x: number; y: number };

function colWidth(n: number): number {
  if (n <= 3) return 200;
  if (n <= 6) return 150;
  return 120;
}

function hhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function WeekCalendar({
  schedule,
  placeName,
  selectedEventId,
  onSlotClick,
  onEventClick,
}: {
  schedule: Schedule;
  placeName: (placeId: string | null) => string | null;
  selectedEventId: string | null;
  onSlotClick: (
    date: string,
    tz: string,
    minutes: number,
    anchor: Anchor,
  ) => void;
  onEventClick: (eventId: string, anchor: Anchor) => void;
}) {
  const { groups, columns, timed, transits, allDayBars, allDayRowCount } =
    schedule;

  const COL = colWidth(columns.length);
  // 縦軸は常に 0:00〜24:00 固定（添付図と同じ）
  const winStart = 0;
  const winEnd = 24 * 60;
  const bodyH = ((winEnd - winStart) / 60) * HOUR_PX;
  const totalW = columns.length * COL;

  const colIndexByKey = useMemo(
    () => new Map(columns.map((c, i) => [c.key, i])),
    [columns],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  // 0時始まりだと早朝が無駄に見えるので、初回だけ 6:00 付近へスクロール。
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 6 * HOUR_PX;
  }, []);

  const y = (min: number) =>
    ((Math.min(Math.max(min, winStart), winEnd) - winStart) / 60) * HOUR_PX;

  const hourTicks: number[] = [];
  for (let m = winStart; m <= winEnd; m += 60) hourTicks.push(m);

  if (columns.length === 0) {
    return (
      <p className="rounded-md border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
        この旅行の日付が未設定です。予定を追加すると、その日からカレンダーが出ます。
      </p>
    );
  }

  const allDayBandH = Math.max(allDayRowCount, 1) * ALLDAY_ROW + 4;

  const blockLabel = (ev: ScheduleEvent) => {
    const pn = placeName(ev.placeId);
    return (
      <>
        <span className="font-medium">{ev.title}</span>
        {pn && <span className="block truncate opacity-70">{pn}</span>}
      </>
    );
  };

  return (
    <div
      ref={scrollRef}
      className="max-h-[70vh] overflow-auto rounded-md border border-zinc-200 bg-white"
    >
      <div style={{ width: GUTTER + totalW }}>
        {/* ── ヘッダ（縦スクロールしても上部固定） ── */}
        <div className="sticky top-0 z-30 flex border-b border-zinc-200 bg-white">
          <div
            className="sticky left-0 z-40 shrink-0 border-r border-zinc-200 bg-white"
            style={{ width: GUTTER }}
          />
          {groups.map((g) => (
            <div
              key={g.key}
              className="shrink-0 border-r border-zinc-200 px-1 py-1 text-center"
              style={{ width: g.columns.length * COL }}
            >
              <div className="text-xs font-medium text-zinc-800">
                {g.label}
              </div>
              {g.tzNote && (
                <div className="truncate text-[10px] text-amber-700">
                  ✈ {g.tzNote}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── 終日帯 ── */}
        <div className="flex border-b border-zinc-200 bg-zinc-50">
          <div
            className="sticky left-0 z-20 flex shrink-0 items-center justify-center border-r border-zinc-200 bg-zinc-50 text-[10px] text-zinc-500"
            style={{ width: GUTTER }}
          >
            終日
          </div>
          <div
            className="relative"
            style={{ width: totalW, height: allDayBandH }}
          >
            {allDayBars.map((b) => (
              <button
                key={b.event.id}
                type="button"
                onClick={(e) =>
                  onEventClick(b.event.id, { x: e.clientX, y: e.clientY })
                }
                className={`absolute truncate rounded px-1 text-left text-[11px] ${
                  selectedEventId === b.event.id
                    ? "bg-amber-300 text-amber-950"
                    : "bg-amber-200 text-amber-900 hover:bg-amber-300"
                }`}
                style={{
                  left: b.startColIndex * COL + 2,
                  width: (b.endColIndex - b.startColIndex + 1) * COL - 4,
                  top: b.row * ALLDAY_ROW + 2,
                  height: ALLDAY_ROW - 2,
                }}
                title={b.event.title}
              >
                {b.event.title}
              </button>
            ))}
          </div>
        </div>

        {/* ── 本体（0:00〜24:00 固定グリッド） ── */}
        <div className="flex">
          {/* 時刻ガター */}
          <div
            className="sticky left-0 z-20 shrink-0 border-r border-zinc-200 bg-white"
            style={{ width: GUTTER, height: bodyH }}
          >
            <div className="relative h-full">
              {hourTicks.map((m) => (
                <div
                  key={m}
                  className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-zinc-400"
                  style={{ top: y(m) }}
                >
                  {m < winEnd ? hhmm(m) : ""}
                </div>
              ))}
            </div>
          </div>

          {/* 日カラム領域 */}
          <div className="relative" style={{ width: totalW, height: bodyH }}>
            {/* 時間の横罫線 */}
            {hourTicks.map((m) => (
              <div
                key={m}
                className="absolute left-0 border-t border-zinc-100"
                style={{ top: y(m), width: totalW }}
              />
            ))}

            {/* 列の縦罫線＋クリックで予定追加 */}
            {columns.map((c, i) => (
              <div
                key={c.key}
                className="absolute top-0 cursor-pointer border-r border-zinc-100"
                style={{ left: i * COL, width: COL, height: bodyH }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const off = e.clientY - rect.top;
                  const raw = winStart + (off / HOUR_PX) * 60;
                  const snapped = Math.round(raw / 30) * 30;
                  onSlotClick(
                    c.date,
                    c.tz,
                    Math.max(0, Math.min(1439, snapped)),
                    { x: e.clientX, y: e.clientY },
                  );
                }}
              />
            ))}

            {/* 時刻イベント */}
            {timed.map((p) => {
              const i = colIndexByKey.get(p.columnKey);
              if (i == null) return null;
              const top = y(p.topMin);
              const h = Math.max(y(p.endMin) - top, MIN_BLOCK);
              const w = COL / p.laneCount;
              const sel = selectedEventId === p.event.id;
              return (
                <button
                  key={`${p.event.id}-${p.columnKey}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventClick(p.event.id, { x: e.clientX, y: e.clientY });
                  }}
                  className={`absolute overflow-hidden rounded border px-1 py-0.5 text-left text-[11px] leading-tight ${
                    sel
                      ? "z-10 border-blue-500 bg-blue-100 text-blue-950"
                      : p.event.visibility === "private"
                        ? "border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                        : "border-emerald-300 bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                  }`}
                  style={{
                    left: i * COL + p.lane * w + 1,
                    width: w - 2,
                    top,
                    height: h - 1,
                  }}
                >
                  <span className="block text-[10px] tabular-nums opacity-70">
                    {hhmm(p.topMin)}
                  </span>
                  {blockLabel(p.event)}
                </button>
              );
            })}

            {/* 時差移動：出発列ブロック＋到着列ブロック＋リボン */}
            {transits.map((t) => {
              const di = colIndexByKey.get(t.departColumnKey);
              const ai = colIndexByKey.get(t.arriveColumnKey);
              if (di == null || ai == null) return null;
              const yd = y(t.departMin);
              const ya = y(t.arriveMin);
              const sel = selectedEventId === t.event.id;
              const base = sel
                ? "border-violet-500 bg-violet-200 text-violet-950"
                : "border-violet-300 bg-violet-100 text-violet-900 hover:bg-violet-200";
              return (
                <div key={t.event.id}>
                  {/* 出発側 */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(t.event.id, { x: e.clientX, y: e.clientY });
                    }}
                    className={`absolute overflow-hidden rounded border px-1 py-0.5 text-left text-[11px] leading-tight ${base}`}
                    style={{
                      left: di * COL + 1,
                      width: COL - 2,
                      top: yd,
                      height: Math.max(bodyH - yd, MIN_BLOCK),
                    }}
                  >
                    <span className="block text-[10px] tabular-nums opacity-70">
                      ✈ {hhmm(t.departMin)} 発
                    </span>
                    <span className="font-medium">{t.event.title}</span>
                  </button>
                  {/* 到着側 */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(t.event.id, { x: e.clientX, y: e.clientY });
                    }}
                    className={`absolute overflow-hidden rounded border px-1 py-0.5 text-left text-[11px] leading-tight ${base}`}
                    style={{
                      left: ai * COL + 1,
                      width: COL - 2,
                      top: 0,
                      height: Math.max(ya, MIN_BLOCK),
                    }}
                  >
                    <span className="block text-[10px] tabular-nums opacity-70">
                      ✈ {hhmm(t.arriveMin)} 着
                    </span>
                    <span className="font-medium">{t.event.title}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
