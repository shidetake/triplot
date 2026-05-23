"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MIN_EVENT_MIN, type Schedule, type ScheduleEvent } from "@/lib/schedule";

const GUTTER = 48; // 時刻ガター幅 px
const HOUR_PX = 29; // 1時間の高さ px（従来48の約6割）
const ALLDAY_ROW = 22; // 終日バー1行の高さ px
const MIN_BLOCK = 16; // イベントブロックの最低高さ px

export type Anchor = { x: number; y: number };

// PC ドラッグで描画中の可変長ゴースト。状態は親で持つ（form 開閉と
// ライフサイクルを合わせるため）。columnIndex は schedule.columns 基準。
export type PcDragRender = {
  columnIndex: number;
  startMin: number;
  endMin: number;
};

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
  pcDrag,
  onPcDragChange,
  onSlotClick,
  onAllDaySlotClick,
  onEventClick,
}: {
  schedule: Schedule;
  placeName: (placeId: string | null) => string | null;
  selectedEventId: string | null;
  // PC ドラッグの可変長ゴースト。フォームが開いている間も残したいので
  // 状態は親(ScheduleSection)持ち。閉じる/確定で親が null クリアする。
  pcDrag: PcDragRender | null;
  onPcDragChange: (next: PcDragRender | null) => void;
  onSlotClick: (
    date: string,
    tz: string,
    minutes: number,
    anchor: Anchor,
    // PC ドラッグで終了時刻を確定した時のみ渡される（タップ/クリックは省略）
    endMinutes?: number,
  ) => void;
  // 終日帯の空きを長押し→離して終日予定追加。横ドラッグで日付変更。
  onAllDaySlotClick: (date: string, anchor: Anchor) => void;
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
    // 本体（全列を含む relative コンテナ）。横ドラッグで列を跨ぐので、
    // 個別の列 el ではなく親で座標→列インデックスに変換する。
    bodyEl: HTMLElement;
    pressFired: boolean;
  } | null>(null);
  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressInfo.current = null;
  }, []);

  // ── PC のドラッグで予定追加（Google カレンダー風） ──
  // pointer events を pointerType==="mouse" で絞って使う。touch は別系統
  // （長押し）で扱うのでここでは無視。click(pointerup-no-drag)は1時間枠
  // のフォーム、drag は可変長で開始/終了を form に渡す。
  // pcDrag 状態は親が持つ（フォーム表示中もゴーストを残すため）。
  const pcDragRef = useRef<{
    date: string;
    tz: string;
    columnIndex: number;
    columnEl: HTMLElement;
    startMin: number;
    startClientX: number;
    startClientY: number;
    dragging: boolean;
  } | null>(null);

  // ── 終日帯のゴースト（横ドラッグで日付選択。1日固定） ──
  type AllDayGhost = { date: string; columnIndex: number };
  const [allDayGhost, setAllDayGhostState] = useState<AllDayGhost | null>(null);
  const allDayGhostRef = useRef<AllDayGhost | null>(null);
  const setAllDayGhost = useCallback((g: AllDayGhost | null) => {
    allDayGhostRef.current = g;
    setAllDayGhostState(g);
  }, []);
  const allDayLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const allDayLongPressInfo = useRef<{
    startX: number;
    startY: number;
    stripEl: HTMLElement;
    pressFired: boolean;
  } | null>(null);
  const clearAllDayLongPress = useCallback(() => {
    if (allDayLongPressTimer.current) {
      clearTimeout(allDayLongPressTimer.current);
      allDayLongPressTimer.current = null;
    }
    allDayLongPressInfo.current = null;
  }, []);
  const columnIndexFromX = useCallback(
    (stripEl: HTMLElement, clientX: number): number => {
      const rect = stripEl.getBoundingClientRect();
      return Math.max(
        0,
        Math.min(columns.length - 1, Math.floor((clientX - rect.left) / COL)),
      );
    },
    [columns.length, COL],
  );

  // ── ゴースト中のページ touch スクロール抑止 ──
  // useEffect 経由だと長押し成立から listener 登録までに 1 フレーム空き、
  // その隙にスクロールしてしまう（ユーザ報告）ので、長押し成立時に
  // 即時登録できる imperative 関数として用意する。
  const scrollLockRef = useRef<((e: TouchEvent) => void) | null>(null);
  const lockPageScroll = useCallback(() => {
    if (scrollLockRef.current) return;
    const h = (e: TouchEvent) => e.preventDefault();
    scrollLockRef.current = h;
    document.addEventListener("touchmove", h, { passive: false });
  }, []);
  const unlockPageScroll = useCallback(() => {
    const h = scrollLockRef.current;
    if (h) {
      document.removeEventListener("touchmove", h);
      scrollLockRef.current = null;
    }
  }, []);

  // ── 端ドラッグで auto-scroll（画面外の時刻/日付へ持っていける） ──
  // ゴースト中はページスクロールを止めているので、画面外に行きたい時は
  // ここで finger 位置 → 端ならカレンダーを継続的に scroll する。ゴースト
  // 位置は finger に追従するよう rAF tick の中で再計算する。
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);
  const dragModeRef = useRef<"time" | "allday" | null>(null);
  const autoScrollRef = useRef<{
    rafId: number | null;
    vx: number;
    vy: number;
  }>({ rafId: null, vx: 0, vy: 0 });
  // tick の本体は render 依存値（columns / COL）を直接参照する。各 render で
  // 最新クロージャを ref に詰め直し、rAF へ渡すラッパは ref 越しに最新版を
  // 呼ぶ（useCallback の deps が render ごとに変わって immutability ルール
  // に引っかかるのを回避しつつ、最新の columns 等が見える）。
  const tickRef = useRef<() => void>(() => {});
  useEffect(() => {
    tickRef.current = () => {
      const el = scrollRef.current;
      const st = autoScrollRef.current;
      if (!el) {
        st.rafId = null;
        return;
      }
      if (st.vx) el.scrollLeft += st.vx;
      if (st.vy) el.scrollTop += st.vy;
      const pos = dragPosRef.current;
      if (pos) {
        if (dragModeRef.current === "time") {
          const info = longPressInfo.current;
          if (info?.pressFired) {
            const bodyRect = info.bodyEl.getBoundingClientRect();
            const newMin = Math.max(0, yToMin(pos.y - bodyRect.top) - 30);
            const newIdx = Math.max(
              0,
              Math.min(
                columns.length - 1,
                Math.floor((pos.x - bodyRect.left) / COL),
              ),
            );
            const newC = columns[newIdx];
            const g = ghostRef.current;
            if (
              newC &&
              g &&
              (newMin !== g.startMin || newIdx !== g.columnIndex)
            ) {
              setGhost({
                date: newC.date,
                tz: newC.tz,
                columnIndex: newIdx,
                startMin: newMin,
              });
            }
          }
        } else if (dragModeRef.current === "allday") {
          const info = allDayLongPressInfo.current;
          if (info?.pressFired) {
            const rect = info.stripEl.getBoundingClientRect();
            const idx = Math.max(
              0,
              Math.min(
                columns.length - 1,
                Math.floor((pos.x - rect.left) / COL),
              ),
            );
            const c = columns[idx];
            const g = allDayGhostRef.current;
            if (c && g && idx !== g.columnIndex) {
              setAllDayGhost({ date: c.date, columnIndex: idx });
            }
          }
        }
      }
      if (st.vx !== 0 || st.vy !== 0) {
        st.rafId = requestAnimationFrame(() => tickRef.current());
      } else {
        st.rafId = null;
      }
    };
  });
  const updateAutoScroll = useCallback(
    (clientX: number, clientY: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const EDGE = 40;
      const SPEED = 8;
      const mode = dragModeRef.current;
      let vx = 0;
      let vy = 0;
      // 左端は時刻ガター(GUTTER)が常に居座っているので、列が始まる
      // 位置（rect.left + GUTTER）を基準にトリガを置く。これが無いと
      // ゴーストがガター裏に潜り込んでから初めて auto-scroll が動いて
      // ガターに被って見える。
      const leftEdge = rect.left + GUTTER + EDGE;
      if (mode === "time") {
        // 通常予定は時刻＋日付の両軸を動かせるので、縦/横の両端で反応
        if (clientY < rect.top + EDGE) vy = -SPEED;
        else if (clientY > rect.bottom - EDGE) vy = SPEED;
        if (clientX < leftEdge) vx = -SPEED;
        else if (clientX > rect.right - EDGE) vx = SPEED;
      } else if (mode === "allday") {
        // 終日ゴーストは横移動のみ → 横の端だけ反応
        if (clientX < leftEdge) vx = -SPEED;
        else if (clientX > rect.right - EDGE) vx = SPEED;
      }
      const st = autoScrollRef.current;
      st.vx = vx;
      st.vy = vy;
      if ((vx !== 0 || vy !== 0) && st.rafId == null) {
        st.rafId = requestAnimationFrame(() => tickRef.current());
      }
    },
    [],
  );
  const stopAutoScroll = useCallback(() => {
    const st = autoScrollRef.current;
    st.vx = 0;
    st.vy = 0;
    if (st.rafId != null) {
      cancelAnimationFrame(st.rafId);
      st.rafId = null;
    }
  }, []);

  // アンマウント時に万一残っていれば後片付け。
  useEffect(() => {
    return () => {
      unlockPageScroll();
      stopAutoScroll();
    };
  }, [unlockPageScroll, stopAutoScroll]);


  const hourTicks: number[] = [];
  for (let m = winStart; m <= winEnd; m += 60) hourTicks.push(m);

  // ゴーストが既存予定と時間帯で重なるとき、ゴーストを含めてレーンを
  // 引き直す。schedule.ts の cluster + greedy lane と同じアルゴリズム
  // を踏襲して、ゴーストの列に居る既存 PlacedEvent ＋ ゴーストを並べ替え、
  // 重なるクラスタ内の lane/laneCount を override する map を作る。
  // 重ならない時は map に何も入れない＝既存も従来通り、ゴーストも全幅。
  const GHOST_KEY = "__ghost__";
  const laneOverrides = useMemo<Map<
    string,
    { lane: number; laneCount: number }
  > | null>(() => {
    // タッチの長押しゴースト or PC ドラッグゴーストどちらかを対象に。
    const target = ghost
      ? {
          col: columns[ghost.columnIndex],
          topMin: ghost.startMin,
          endMin: ghost.startMin + 60,
        }
      : pcDrag
        ? {
            col: columns[pcDrag.columnIndex],
            topMin: pcDrag.startMin,
            endMin: pcDrag.endMin,
          }
        : null;
    if (!target || !target.col) return null;
    const ghostColKey = target.col.key;
    type Entry = { topMin: number; endMin: number; id: string };
    const entries: Entry[] = [
      ...timed
        .filter((p) => p.columnKey === ghostColKey)
        .map((p) => ({
          topMin: p.topMin,
          endMin: p.endMin,
          id: p.event.id,
        })),
      {
        topMin: target.topMin,
        endMin: target.endMin,
        id: GHOST_KEY,
      },
    ];
    entries.sort((a, b) => a.topMin - b.topMin || a.endMin - b.endMin);

    const result = new Map<string, { lane: number; laneCount: number }>();
    let cluster: Entry[] = [];
    let clusterEnd = -1;
    const flush = () => {
      const laneEnds: number[] = [];
      const assigned: { e: Entry; lane: number }[] = [];
      for (const e of cluster) {
        const dispEnd = Math.max(e.endMin, e.topMin + MIN_EVENT_MIN);
        let lane = laneEnds.findIndex((ee) => ee <= e.topMin);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(dispEnd);
        } else {
          laneEnds[lane] = dispEnd;
        }
        assigned.push({ e, lane });
      }
      const laneCount = laneEnds.length;
      const hasGhost = cluster.some((c) => c.id === GHOST_KEY);
      // ゴーストが他予定と重なる時だけ override（laneCount>1）。重ならない
      // クラスタや、ゴースト不在クラスタは元の lane を使う。
      if (hasGhost && laneCount > 1) {
        for (const { e, lane } of assigned) {
          result.set(e.id, { lane, laneCount });
        }
      }
      cluster = [];
      clusterEnd = -1;
    };
    for (const e of entries) {
      const dispEnd = Math.max(e.endMin, e.topMin + MIN_EVENT_MIN);
      if (cluster.length === 0 || e.topMin < clusterEnd) {
        cluster.push(e);
        clusterEnd = Math.max(clusterEnd, dispEnd);
      } else {
        flush();
        cluster.push(e);
        clusterEnd = dispEnd;
      }
    }
    if (cluster.length) flush();
    return result;
  }, [ghost, pcDrag, timed, columns]);

  // 終日ゴーストの行（rowStack）。ゴーストの列を覆う既存バーの行を避けて
  // 空いている最小 row を割り当てる。同列に既存バーが居なければ row=0、
  // 全段埋まっていれば新規 row（バンド高さも伸ばす）。
  const ghostAllDayRow = useMemo<number | null>(() => {
    if (!allDayGhost) return null;
    const idx = allDayGhost.columnIndex;
    const occupied = new Set<number>();
    for (const b of allDayBars) {
      if (b.startColIndex <= idx && b.endColIndex >= idx) {
        occupied.add(b.row);
      }
    }
    let row = 0;
    while (occupied.has(row)) row++;
    return row;
  }, [allDayGhost, allDayBars]);

  if (columns.length === 0) {
    return (
      <p className="rounded-md border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
        この旅行の日付が未設定です。予定を追加すると、その日からカレンダーが出ます。
      </p>
    );
  }

  // ゴーストが既存より下の段を使う場合はバンドを伸ばす。
  const effectiveAllDayRows = Math.max(
    allDayRowCount,
    ghostAllDayRow != null ? ghostAllDayRow + 1 : 0,
  );
  const allDayBandH = Math.max(effectiveAllDayRows, 1) * ALLDAY_ROW + 4;

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
              className="relative shrink-0 border-r border-zinc-200 px-1 py-1 text-center"
              style={{ width: g.columns.length * COL }}
            >
              <div className="text-xs font-medium text-zinc-800">
                {g.label}
              </div>
              {g.tzNote && (
                // 前進する便は注記だけ出発日＋到着日の2列ぶんの幅で見せる
                // （列は結合しない）。狭い時は2行まで折り返す。
                <div
                  className="line-clamp-2 text-[10px] leading-tight text-amber-700"
                  style={{ width: (g.tzNoteSpan ?? g.columns.length) * COL }}
                >
                  ✈ {g.tzNote}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── 終日帯 ── */}
        <div className="flex border-b border-zinc-200 bg-zinc-50">
          <div
            className="sticky left-0 z-[25] flex shrink-0 items-center justify-center border-r border-zinc-200 bg-zinc-50 text-[10px] text-zinc-500"
            style={{ width: GUTTER }}
          >
            終日
          </div>
          <div
            className="relative"
            style={{ width: totalW, height: allDayBandH }}
            onTouchStart={(e) => {
              recentTouchUntil.current = performance.now() + 700;
              // 既存の終日バー上でのタッチは選択用なので長押し対象外
              const target = e.target as HTMLElement;
              if (target.closest("button")) return;
              if (e.touches.length !== 1) {
                clearAllDayLongPress();
                return;
              }
              const t = e.touches[0];
              const stripEl = e.currentTarget;
              clearAllDayLongPress();
              allDayLongPressInfo.current = {
                startX: t.clientX,
                startY: t.clientY,
                stripEl,
                pressFired: false,
              };
              allDayLongPressTimer.current = setTimeout(() => {
                allDayLongPressTimer.current = null;
                const info = allDayLongPressInfo.current;
                if (!info) return;
                info.pressFired = true;
                const idx = columnIndexFromX(info.stripEl, t.clientX);
                const c = columns[idx];
                if (!c) return;
                // 成立した瞬間にページ scroll を即時ロック（useEffect 経由
                // だと 1 フレーム空いてスクロールが滑る原因になる）。
                lockPageScroll();
                dragModeRef.current = "allday";
                dragPosRef.current = { x: t.clientX, y: t.clientY };
                setAllDayGhost({ date: c.date, columnIndex: idx });
              }, 500);
            }}
            onTouchMove={(e) => {
              const info = allDayLongPressInfo.current;
              if (!info) return;
              const t = e.touches[0];
              if (!t) return;
              if (!info.pressFired) {
                if (
                  Math.abs(t.clientX - info.startX) > 10 ||
                  Math.abs(t.clientY - info.startY) > 10
                ) {
                  clearAllDayLongPress();
                }
                return;
              }
              dragPosRef.current = { x: t.clientX, y: t.clientY };
              const idx = columnIndexFromX(info.stripEl, t.clientX);
              const c = columns[idx];
              const g = allDayGhostRef.current;
              if (c && g && idx !== g.columnIndex) {
                setAllDayGhost({ date: c.date, columnIndex: idx });
              }
              // 端なら auto-scroll（横方向）。
              updateAutoScroll(t.clientX, t.clientY);
            }}
            onTouchEnd={() => {
              const info = allDayLongPressInfo.current;
              recentTouchUntil.current = performance.now() + 700;
              clearAllDayLongPress();
              stopAutoScroll();
              dragPosRef.current = null;
              dragModeRef.current = null;
              unlockPageScroll();
              if (info?.pressFired) {
                const g = allDayGhostRef.current;
                if (g) {
                  const stripRect = info.stripEl.getBoundingClientRect();
                  const anchorX =
                    stripRect.left + g.columnIndex * COL + COL / 2;
                  const anchorY = stripRect.top + stripRect.height / 2;
                  setAllDayGhost(null);
                  onAllDaySlotClick(g.date, { x: anchorX, y: anchorY });
                  return;
                }
              }
              setAllDayGhost(null);
            }}
            onTouchCancel={() => {
              clearAllDayLongPress();
              stopAutoScroll();
              dragPosRef.current = null;
              dragModeRef.current = null;
              unlockPageScroll();
              setAllDayGhost(null);
            }}
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
            {/* スマホ長押し中のゴースト枠（1日分・半透明）。同列に既存
                バーがあればその下の段に積み上げる（足りなければバンドも伸びる）。 */}
            {allDayGhost && (() => {
              const [, m, d] = allDayGhost.date.split("-");
              const row = ghostAllDayRow ?? 0;
              return (
                <div
                  className="pointer-events-none absolute z-20 truncate rounded border border-amber-400 bg-amber-100/50 px-1 text-[11px] leading-tight text-amber-900"
                  style={{
                    left: allDayGhost.columnIndex * COL + 2,
                    width: COL - 4,
                    top: row * ALLDAY_ROW + 2,
                    height: ALLDAY_ROW - 2,
                  }}
                >
                  {Number(m)}/{Number(d)}
                </div>
              );
            })()}
          </div>
        </div>

        {/* ── 本体（0:00〜24:00 固定グリッド） ── */}
        <div className="flex">
          {/* 時刻ガター */}
          <div
            className="sticky left-0 z-[25] shrink-0 border-r border-zinc-200 bg-white"
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
                onPointerDown={(e) => {
                  // PC（マウス）専用。touch / pen は touch 系で扱うので無視。
                  if (e.pointerType !== "mouse") return;
                  if (e.button !== 0) return; // 左クリックのみ
                  const colEl = e.currentTarget;
                  const rect = colEl.getBoundingClientRect();
                  const off = e.clientY - rect.top;
                  const raw = winStart + (off / HOUR_PX) * 60;
                  const snapped = Math.max(
                    0,
                    Math.min(1380, Math.round(raw / 30) * 30),
                  );
                  pcDragRef.current = {
                    date: c.date,
                    tz: c.tz,
                    columnIndex: i,
                    columnEl: colEl,
                    startMin: snapped,
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    dragging: false,
                  };
                  // ポインタを列に固定して、はみ出しても move/up が届くように。
                  colEl.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (e.pointerType !== "mouse") return;
                  const info = pcDragRef.current;
                  if (!info) return;
                  // 5px 動いたら "ドラッグ" として可変長ゴースト表示開始
                  if (!info.dragging) {
                    if (
                      Math.abs(e.clientX - info.startClientX) > 5 ||
                      Math.abs(e.clientY - info.startClientY) > 5
                    ) {
                      info.dragging = true;
                    } else {
                      return;
                    }
                  }
                  // 現在 Y → 終了時刻（30分スナップ・最小30分・上限24:00）
                  const rect = info.columnEl.getBoundingClientRect();
                  const off = e.clientY - rect.top;
                  const raw = winStart + (off / HOUR_PX) * 60;
                  const snapped = Math.max(
                    info.startMin + 30,
                    Math.min(24 * 60, Math.round(raw / 30) * 30),
                  );
                  onPcDragChange({
                    columnIndex: info.columnIndex,
                    startMin: info.startMin,
                    endMin: snapped,
                  });
                }}
                onPointerUp={(e) => {
                  if (e.pointerType !== "mouse") return;
                  const info = pcDragRef.current;
                  pcDragRef.current = null;
                  if (!info) return;
                  if (info.columnEl.hasPointerCapture(e.pointerId)) {
                    info.columnEl.releasePointerCapture(e.pointerId);
                  }
                  if (info.dragging) {
                    // ドラッグ確定 → 開始/終了を form に渡す。
                    // ゴースト(pcDrag)は親が form 閉じ時にクリアするので、
                    // ここでは触らず開いてる間は表示し続ける。
                    const end = pcDrag?.endMin ?? info.startMin + 60;
                    onSlotClick(
                      info.date,
                      info.tz,
                      info.startMin,
                      { x: e.clientX, y: e.clientY },
                      end,
                    );
                  } else {
                    // ドラッグ無し＝ただのクリック → 既存挙動（1時間枠）
                    onPcDragChange(null);
                    onSlotClick(info.date, info.tz, info.startMin, {
                      x: e.clientX,
                      y: e.clientY,
                    });
                  }
                }}
                onPointerCancel={(e) => {
                  if (e.pointerType !== "mouse") return;
                  pcDragRef.current = null;
                  onPcDragChange(null);
                }}
                onTouchStart={(e) => {
                  recentTouchUntil.current = performance.now() + 700;
                  if (e.touches.length !== 1) {
                    clearLongPress();
                    return;
                  }
                  const t = e.touches[0];
                  const colEl = e.currentTarget;
                  const bodyEl = colEl.parentElement as HTMLElement | null;
                  if (!bodyEl) {
                    clearLongPress();
                    return;
                  }
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
                    bodyEl,
                    pressFired: false,
                  };
                  // 初期ゴーストは押した列・押した位置の時刻
                  const initialDate = c.date;
                  const initialTz = c.tz;
                  const initialIdx = i;
                  longPressTimer.current = setTimeout(() => {
                    longPressTimer.current = null;
                    const info = longPressInfo.current;
                    if (!info) return;
                    info.pressFired = true;
                    // 成立した瞬間にページ scroll を即時ロック（useEffect
                    // 経由だと 1 フレーム空く＝指を動かしてもスクロール
                    // してしまう問題の根本対策）。
                    lockPageScroll();
                    dragModeRef.current = "time";
                    dragPosRef.current = {
                      x: info.startX,
                      y: info.startY,
                    };
                    setGhost({
                      date: initialDate,
                      tz: initialTz,
                      columnIndex: initialIdx,
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
                  // 長押し成立後: 縦＝時刻、横＝日付の両方に追従。
                  dragPosRef.current = { x: t.clientX, y: t.clientY };
                  const bodyRect = info.bodyEl.getBoundingClientRect();
                  const newMin = Math.max(
                    0,
                    yToMin(t.clientY - bodyRect.top) - 30,
                  );
                  const newIdx = Math.max(
                    0,
                    Math.min(
                      columns.length - 1,
                      Math.floor((t.clientX - bodyRect.left) / COL),
                    ),
                  );
                  const newC = columns[newIdx];
                  const g = ghostRef.current;
                  if (
                    newC &&
                    g &&
                    (newMin !== g.startMin || newIdx !== g.columnIndex)
                  ) {
                    setGhost({
                      date: newC.date,
                      tz: newC.tz,
                      columnIndex: newIdx,
                      startMin: newMin,
                    });
                  }
                  // 端なら auto-scroll（縦+横）。
                  updateAutoScroll(t.clientX, t.clientY);
                }}
                onTouchEnd={() => {
                  const info = longPressInfo.current;
                  recentTouchUntil.current = performance.now() + 700;
                  clearLongPress();
                  stopAutoScroll();
                  dragPosRef.current = null;
                  dragModeRef.current = null;
                  unlockPageScroll();
                  if (info?.pressFired) {
                    const g = ghostRef.current;
                    if (g) {
                      // 全列を含む本体の rect からゴースト中央位置を計算
                      // （ドラッグで列が変わっていても正しい anchor になる）。
                      const bodyRect = info.bodyEl.getBoundingClientRect();
                      const anchorX =
                        bodyRect.left + g.columnIndex * COL + COL / 2;
                      const anchorY =
                        bodyRect.top +
                        ((g.startMin - winStart) / 60) * HOUR_PX +
                        HOUR_PX / 2;
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
                  stopAutoScroll();
                  dragPosRef.current = null;
                  dragModeRef.current = null;
                  unlockPageScroll();
                  setGhost(null);
                }}
              />
            ))}

            {/* スマホ長押し中のゴースト枠（1時間・半透明） */}
            {ghost &&
              (() => {
                const ov = laneOverrides?.get(GHOST_KEY);
                const lane = ov?.lane ?? 0;
                const laneCount = ov?.laneCount ?? 1;
                const w = COL / laneCount;
                return (
                  <div
                    className="pointer-events-none absolute z-20 rounded border border-emerald-400 bg-emerald-100/50 px-1 py-0.5 text-[11px] leading-tight text-emerald-900"
                    style={{
                      left: ghost.columnIndex * COL + lane * w + 1,
                      width: w - 2,
                      top: y(ghost.startMin),
                      height: HOUR_PX,
                    }}
                  >
                    <span className="block text-[10px] tabular-nums opacity-80">
                      {hhmm(ghost.startMin)}–{hhmm(ghost.startMin + 60)}
                    </span>
                  </div>
                );
              })()}

            {/* PC ドラッグ中のゴースト枠（可変長・半透明） */}
            {pcDrag &&
              (() => {
                const ov = laneOverrides?.get(GHOST_KEY);
                const lane = ov?.lane ?? 0;
                const laneCount = ov?.laneCount ?? 1;
                const w = COL / laneCount;
                return (
                  <div
                    className="pointer-events-none absolute z-20 rounded border border-emerald-400 bg-emerald-100/50 px-1 py-0.5 text-[11px] leading-tight text-emerald-900"
                    style={{
                      left: pcDrag.columnIndex * COL + lane * w + 1,
                      width: w - 2,
                      top: y(pcDrag.startMin),
                      height: y(pcDrag.endMin) - y(pcDrag.startMin),
                    }}
                  >
                    <span className="block text-[10px] tabular-nums opacity-80">
                      {hhmm(pcDrag.startMin)}–{hhmm(pcDrag.endMin)}
                    </span>
                  </div>
                );
              })()}

            {/* 時刻イベント */}
            {timed.map((p) => {
              const i = colIndexByKey.get(p.columnKey);
              if (i == null) return null;
              const top = y(p.topMin);
              const h = Math.max(y(p.endMin) - top, MIN_BLOCK);
              // ゴーストとレーン共有する時だけ override で再計算した lane
              // を使う。それ以外は schedule.ts で確定済みの値をそのまま。
              const ov = laneOverrides?.get(p.event.id);
              const lane = ov?.lane ?? p.lane;
              const laneCount = ov?.laneCount ?? p.laneCount;
              const w = COL / laneCount;
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
                    left: i * COL + lane * w + 1,
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
              if (di === ai) {
                // 同一列で完結する移動（時差が戻らず時刻も前進）。1ブロックで描く。
                return (
                  <button
                    key={t.event.id}
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
                      height: Math.max(ya - yd, MIN_BLOCK),
                    }}
                  >
                    <span className="block text-[10px] tabular-nums opacity-70">
                      ✈ {hhmm(t.departMin)}–{hhmm(t.arriveMin)}
                    </span>
                    <span className="font-medium">{t.event.title}</span>
                  </button>
                );
              }
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
