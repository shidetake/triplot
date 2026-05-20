"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Schedule, ScheduleEvent } from "@/lib/schedule";

const GUTTER = 48; // 時刻ガター幅 px
const HOUR_PX = 29; // 1時間の高さ px（従来48の約6割）
const ALLDAY_ROW = 22; // 終日バー1行の高さ px
const MIN_BLOCK = 16; // イベントブロックの最低高さ px

export type Anchor = { x: number; y: number };

function colWidth(n: number): number {
  // 1日の横幅は従来（200/150/120）の約6割
  if (n <= 3) return 120;
  if (n <= 6) return 90;
  return 72;
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

  // 日跨ぎ／時差移動は同一イベントが複数ブロックに分かれる。CSS の hover:
  // だと乗っているブロックしか光らないので、選択と同様に JS で全ブロックを光らせる。
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  // 0時始まりだと早朝が無駄に見えるので、初回だけ 6:00 付近へスクロール。
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 6 * HOUR_PX;
  }, []);

  const y = (min: number) =>
    ((Math.min(Math.max(min, winStart), winEnd) - winStart) / 60) * HOUR_PX;

  // 30分刻みスナップ。1時間の枠が縦軸からはみ出さないよう 23:00(=1380) を上限。
  const yToMin = useCallback((offsetY: number): number => {
    const raw = winStart + (offsetY / HOUR_PX) * 60;
    return Math.max(0, Math.min(1380, Math.round(raw / 30) * 30));
  }, []);

  // ── スマホの長押し→ゴースト枠→ドラッグで時間移動→離すと予定追加 ──
  // PC は従来通りクリックで即追加（mouse は touch を出さないので touch
  // 系の経路に入らない・onClick は recentTouchUntil で touch 直後の合成
  // click だけ除外する）。
  type Ghost = {
    date: string;
    tz: string;
    columnIndex: number;
    startMin: number;
  };
  const [ghost, setGhostState] = useState<Ghost | null>(null);
  const ghostRef = useRef<Ghost | null>(null);
  const setGhost = useCallback((g: Ghost | null) => {
    ghostRef.current = g;
    setGhostState(g);
  }, []);
  const recentTouchUntil = useRef(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressInfo = useRef<{
    startX: number;
    startY: number;
    date: string;
    tz: string;
    columnIndex: number;
    columnEl: HTMLElement;
    pressFired: boolean;
  } | null>(null);
  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressInfo.current = null;
  }, []);
  // ゴースト表示中はページの touch スクロールを止める（React の onTouchMove
  // は passive なので preventDefault は document の non-passive listener で）。
  useEffect(() => {
    if (!ghost) return;
    const onMove = (e: TouchEvent) => e.preventDefault();
    document.addEventListener("touchmove", onMove, { passive: false });
    return () => document.removeEventListener("touchmove", onMove);
  }, [ghost]);

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
      // iOS Safari は長押しで拡大鏡(loupe)＋テキスト選択を出してしまい、
      // 自前の長押し→ゴースト追加と被って使いにくい。カレンダー内は
      // 選択不要なので user-select:none / touch-callout:none で抑止する。
      style={{ WebkitTouchCallout: "none" }}
      className="max-h-[70vh] select-none overflow-auto rounded-md border border-zinc-200 bg-white"
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

            {/* 列の縦罫線＋クリック(PC)/長押し(スマホ) で予定追加 */}
            {columns.map((c, i) => (
              <div
                key={c.key}
                className="absolute top-0 cursor-pointer border-r border-zinc-100"
                style={{ left: i * COL, width: COL, height: bodyH }}
                onClick={(e) => {
                  // スマホはタップでは追加しない（長押し経由のみ）。
                  // touch 直後の合成 click を除外する。マウスは touch を
                  // 出さないので素通り＝PC は従来通り。
                  if (performance.now() < recentTouchUntil.current) return;
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
                onTouchStart={(e) => {
                  recentTouchUntil.current = performance.now() + 700;
                  if (e.touches.length !== 1) {
                    clearLongPress();
                    return;
                  }
                  const t = e.touches[0];
                  const colEl = e.currentTarget;
                  const rect = colEl.getBoundingClientRect();
                  // 指の30分上を仮ピンの開始時刻に。指で隠れず見やすい。
                  const startMin = Math.max(
                    0,
                    yToMin(t.clientY - rect.top) - 30,
                  );
                  clearLongPress();
                  longPressInfo.current = {
                    startX: t.clientX,
                    startY: t.clientY,
                    date: c.date,
                    tz: c.tz,
                    columnIndex: i,
                    columnEl: colEl,
                    pressFired: false,
                  };
                  longPressTimer.current = setTimeout(() => {
                    longPressTimer.current = null;
                    const info = longPressInfo.current;
                    if (!info) return;
                    info.pressFired = true;
                    setGhost({
                      date: info.date,
                      tz: info.tz,
                      columnIndex: info.columnIndex,
                      startMin,
                    });
                  }, 500);
                }}
                onTouchMove={(e) => {
                  const info = longPressInfo.current;
                  if (!info) return;
                  const t = e.touches[0];
                  if (!t) return;
                  if (!info.pressFired) {
                    // 長押し成立前に大きく動いた＝スクロール扱いで取消
                    if (
                      Math.abs(t.clientX - info.startX) > 10 ||
                      Math.abs(t.clientY - info.startY) > 10
                    ) {
                      clearLongPress();
                    }
                    return;
                  }
                  // 長押し成立後: 縦方向に追従してゴースト時刻を更新
                  // （onTouchStart と同じく指の30分上に置く）。
                  const rect = info.columnEl.getBoundingClientRect();
                  const newMin = Math.max(
                    0,
                    yToMin(t.clientY - rect.top) - 30,
                  );
                  const g = ghostRef.current;
                  if (g && newMin !== g.startMin) {
                    setGhost({ ...g, startMin: newMin });
                  }
                }}
                onTouchEnd={() => {
                  const info = longPressInfo.current;
                  recentTouchUntil.current = performance.now() + 700;
                  clearLongPress();
                  if (info?.pressFired) {
                    const g = ghostRef.current;
                    if (g) {
                      const rect = info.columnEl.getBoundingClientRect();
                      // ゴースト枠の中央あたりを anchor に（FormPopover 用）
                      const anchorY =
                        rect.top + ((g.startMin - winStart) / 60) * HOUR_PX +
                        HOUR_PX / 2;
                      const anchorX = rect.left + rect.width / 2;
                      setGhost(null);
                      onSlotClick(g.date, g.tz, g.startMin, {
                        x: anchorX,
                        y: anchorY,
                      });
                      return;
                    }
                  }
                  setGhost(null);
                }}
                onTouchCancel={() => {
                  clearLongPress();
                  setGhost(null);
                }}
              />
            ))}

            {/* スマホ長押し中のゴースト枠（1時間・半透明） */}
            {ghost && (
              <div
                className="pointer-events-none absolute z-20 rounded border border-emerald-400 bg-emerald-100/50 px-1 py-0.5 text-[11px] leading-tight text-emerald-900"
                style={{
                  left: ghost.columnIndex * COL + 1,
                  width: COL - 2,
                  top: y(ghost.startMin),
                  height: HOUR_PX,
                }}
              >
                <span className="block text-[10px] tabular-nums opacity-80">
                  {hhmm(ghost.startMin)}–{hhmm(ghost.startMin + 60)}
                </span>
              </div>
            )}

            {/* 時刻イベント */}
            {timed.map((p) => {
              const i = colIndexByKey.get(p.columnKey);
              if (i == null) return null;
              const top = y(p.topMin);
              const h = Math.max(y(p.endMin) - top, MIN_BLOCK);
              const w = COL / p.laneCount;
              const sel = selectedEventId === p.event.id;
              const hov = hoveredEventId === p.event.id;
              return (
                <button
                  key={`${p.event.id}-${p.columnKey}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventClick(p.event.id, { x: e.clientX, y: e.clientY });
                  }}
                  onMouseEnter={() => setHoveredEventId(p.event.id)}
                  onMouseLeave={() => setHoveredEventId(null)}
                  className={`absolute overflow-hidden rounded border px-1 py-0.5 text-left text-[11px] leading-tight ${
                    sel
                      ? "z-10 border-blue-500 bg-blue-100 text-blue-950"
                      : p.event.visibility === "private"
                        ? `border-zinc-300 text-zinc-700 ${hov ? "bg-zinc-200" : "bg-zinc-100"}`
                        : `border-emerald-300 text-emerald-900 ${hov ? "bg-emerald-200" : "bg-emerald-100"}`
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
              const hov = hoveredEventId === t.event.id;
              const base = sel
                ? "border-violet-500 bg-violet-200 text-violet-950"
                : `border-violet-300 text-violet-900 ${hov ? "bg-violet-200" : "bg-violet-100"}`;
              return (
                <div key={t.event.id}>
                  {/* 出発側 */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(t.event.id, { x: e.clientX, y: e.clientY });
                    }}
                    onMouseEnter={() => setHoveredEventId(t.event.id)}
                    onMouseLeave={() => setHoveredEventId(null)}
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
                    onMouseEnter={() => setHoveredEventId(t.event.id)}
                    onMouseLeave={() => setHoveredEventId(null)}
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
