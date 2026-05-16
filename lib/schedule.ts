// 週ビューカレンダーのレイアウト計算（DB を触らない純粋関数）。
//
// 設計の肝 — 「壁時計（floating time）」を絶対に守る:
//  - イベント時刻はすべて「現地の壁時計＋そのTZ」。ここでは Date を「TZ変換目的で」
//    使わない（new Date(str) はローカルTZ解釈でズレる）。日付演算が要る所は
//    Date.UTC で UTC のみを使い、ローカルTZが入り込む経路を作らない。
//  - カレンダーは「絶対時間軸1本」ではなく「旅程ローカル日の列」。普通の日は1列、
//    フライト(transit)の日だけ等幅2列（出発TZ側／到着TZ側）に割り、便はその間を
//    リボンで繋ぐ。これで全日程で同じローカル時刻が同じ高さに揃い（横スキャン可）、
//    TZ跨ぎでも「同じ日が2回」を“隠さず正直に”2列で見せられる。

export type ScheduleEvent = {
  id: string;
  title: string;
  kind: "normal" | "transit";
  allDay: boolean;
  startAt: string; // "YYYY-MM-DDTHH:MM[:SS]" 壁時計（TZ無し）
  endAt: string | null; // 壁時計（TZ無し）
  startTz: string; // IANA。start_at がどのTZの壁時計か
  endTz: string | null; // transit の到着TZ。normal は null（= startTz）
  placeId: string | null;
  visibility: "shared" | "private";
  note: string | null;
};

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

// ──────────────────────────────────────────────
// 壁時計・日付ユーティリティ（UTC のみ。ローカルTZ非依存）
// ──────────────────────────────────────────────

/** "YYYY-MM-DDTHH:MM[:SS]" → 日付文字列と「0時からの分」 */
export function parseWall(s: string): { date: string; minutes: number } {
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/,
  );
  if (!m) return { date: s.slice(0, 10), minutes: 0 };
  const [, , , , hh, mm] = m;
  return {
    date: `${m[1]}-${m[2]}-${m[3]}`,
    minutes: hh ? Number(hh) * 60 + Number(mm) : 0,
  };
}

function dateToUtc(date: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  return Date.UTC(y, mo - 1, d);
}

function utcToDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

export function addDays(date: string, n: number): string {
  return utcToDate(dateToUtc(date) + n * 86400000);
}

/** YYYY-MM-DD は辞書順 = 日付順なので文字列比較で足りる */
function cmpDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function minDate(a: string, b: string): string {
  return cmpDate(a, b) <= 0 ? a : b;
}
function maxDate(a: string, b: string): string {
  return cmpDate(a, b) >= 0 ? a : b;
}

/** "2026-04-27" → "4/27(月)" */
export function formatDayLabel(date: string): string {
  const [, mo, d] = date.split("-").map(Number);
  const wd = WEEKDAY_JA[new Date(dateToUtc(date)).getUTCDay()];
  return `${mo}/${d}(${wd})`;
}

// ──────────────────────────────────────────────
// 列モデル
// ──────────────────────────────────────────────

export type ColumnRole = "day" | "transit-depart" | "transit-arrive";

export type Column = {
  key: string;
  date: string;
  tz: string;
  role: ColumnRole;
};

export type ColumnGroup = {
  key: string;
  /** ヘッダ表示用ラベル（transit は出発/到着の両日付） */
  label: string;
  /** 出発/到着でTZが変わる旨を出すための補助（transit のみ） */
  tzNote: string | null;
  columns: Column[];
};

export type PlacedEvent = {
  event: ScheduleEvent;
  columnKey: string;
  topMin: number;
  endMin: number; // 表示上の下端（最低高さ確保後）
  lane: number;
  laneCount: number;
};

export type PlacedTransit = {
  event: ScheduleEvent;
  departColumnKey: string;
  departMin: number;
  arriveColumnKey: string;
  arriveMin: number;
};

export type AllDayBar = {
  event: ScheduleEvent;
  startColIndex: number;
  endColIndex: number;
  row: number;
};

export type Schedule = {
  groups: ColumnGroup[];
  /** groups を平坦化した列（描画順）。終日バーの列範囲はこのindex基準 */
  columns: Column[];
  timed: PlacedEvent[];
  transits: PlacedTransit[];
  allDayBars: AllDayBar[];
  allDayRowCount: number;
  /** 縦方向の表示窓（無駄な時間帯を切る）。分単位 */
  window: { startMin: number; endMin: number };
};

const MIN_EVENT_MIN = 30; // 表示上の最低高さ（分換算）
const DEFAULT_DURATION_MIN = 60; // end が無い時刻イベントの既定長
// 縦軸は常に 0:00〜24:00 固定（添付図と同じ。予定に応じて伸縮させない）。
const FULL_DAY_WINDOW = { startMin: 0, endMin: 24 * 60 };

// ──────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────

export function buildSchedule(
  events: ScheduleEvent[],
  opts: {
    tripTz: string;
    tripStart?: string | null; // YYYY-MM-DD
    tripEnd?: string | null;
  },
): Schedule {
  const tripTz = opts.tripTz;

  // 1) 表示する日付レンジ（trip 範囲 ∪ イベントが触れる日）
  let rangeStart: string | null = opts.tripStart ?? null;
  let rangeEnd: string | null = opts.tripEnd ?? null;
  for (const ev of events) {
    const s = parseWall(ev.startAt).date;
    const e = ev.endAt ? parseWall(ev.endAt).date : s;
    rangeStart = rangeStart ? minDate(rangeStart, s) : s;
    rangeEnd = rangeEnd ? maxDate(rangeEnd, e) : e;
  }

  if (!rangeStart || !rangeEnd) {
    return {
      groups: [],
      columns: [],
      timed: [],
      transits: [],
      allDayBars: [],
      allDayRowCount: 0,
      window: FULL_DAY_WINDOW,
    };
  }

  // 2) transit を時系列に。出発日でTZが切り替わる
  const transits = events
    .filter((e) => e.kind === "transit" && e.endAt && e.endTz)
    .sort((a, b) => (a.startAt < b.startAt ? -1 : a.startAt > b.startAt ? 1 : 0));

  const groups: ColumnGroup[] = [];

  const pushDay = (date: string, tz: string) => {
    groups.push({
      key: `d-${date}`,
      label: formatDayLabel(date),
      tzNote: null,
      columns: [{ key: `d-${date}`, date, tz, role: "day" }],
    });
  };

  let cursor = rangeStart;
  let currentTz = tripTz;

  for (const t of transits) {
    const departDate = parseWall(t.startAt).date;
    const arriveDate = parseWall(t.endAt as string).date;
    const arriveTz = t.endTz as string;

    // transit までの普通の日
    while (cmpDate(cursor, departDate) < 0 && cmpDate(cursor, rangeEnd) <= 0) {
      pushDay(cursor, currentTz);
      cursor = addDays(cursor, 1);
    }

    // フライトの日 = 等幅2列（出発TZ側 / 到着TZ側）
    const label =
      departDate === arriveDate
        ? formatDayLabel(departDate)
        : `${formatDayLabel(departDate)} → ${formatDayLabel(arriveDate)}`;
    groups.push({
      key: `t-${t.id}`,
      label,
      tzNote: `${t.startTz} → ${arriveTz}`,
      columns: [
        {
          key: `t-${t.id}-dep`,
          date: departDate,
          tz: t.startTz,
          role: "transit-depart",
        },
        {
          key: `t-${t.id}-arr`,
          date: arriveDate,
          tz: arriveTz,
          role: "transit-arrive",
        },
      ],
    });

    // 到着日の翌日から、到着TZの普通の日へ。空中で飛んだ暦日は列を作らない
    currentTz = arriveTz;
    cursor = addDays(arriveDate, 1);
  }

  while (cmpDate(cursor, rangeEnd) <= 0) {
    pushDay(cursor, currentTz);
    cursor = addDays(cursor, 1);
  }

  const columns = groups.flatMap((g) => g.columns);

  // 日付＋TZ → 列。普通日/transit列いずれにも当たるよう (date,tz) で引く
  const colFor = (date: string, tz: string): Column | undefined =>
    columns.find((c) => c.date === date && c.tz === tz) ??
    columns.find((c) => c.date === date); // TZ未一致でも日付一致なら拾う保険

  // 3) 時刻イベントの配置（重なりはレーン分割）
  const timedRaw: Omit<PlacedEvent, "lane" | "laneCount">[] = [];
  const placedTransits: PlacedTransit[] = [];

  for (const ev of events) {
    if (ev.allDay) continue;

    if (ev.kind === "transit" && ev.endAt && ev.endTz) {
      const dep = parseWall(ev.startAt);
      const arr = parseWall(ev.endAt);
      const depCol = colFor(dep.date, ev.startTz);
      const arrCol = colFor(arr.date, ev.endTz);
      if (depCol && arrCol) {
        placedTransits.push({
          event: ev,
          departColumnKey: depCol.key,
          departMin: dep.minutes,
          arriveColumnKey: arrCol.key,
          arriveMin: arr.minutes,
        });
      }
      continue;
    }

    const s = parseWall(ev.startAt);
    const col = colFor(s.date, ev.startTz);
    if (!col) continue;
    const startMin = s.minutes;
    const rawEnd = ev.endAt ? parseWall(ev.endAt).minutes : null;
    const endMin =
      rawEnd != null && rawEnd > startMin
        ? rawEnd
        : startMin + DEFAULT_DURATION_MIN;
    timedRaw.push({
      event: ev,
      columnKey: col.key,
      topMin: startMin,
      endMin,
    });
  }

  // 列ごとに重なりクラスタを作ってレーン割当
  const timed: PlacedEvent[] = [];
  const byColumn = new Map<string, typeof timedRaw>();
  for (const p of timedRaw) {
    const arr = byColumn.get(p.columnKey) ?? [];
    arr.push(p);
    byColumn.set(p.columnKey, arr);
  }
  for (const arr of byColumn.values()) {
    arr.sort((a, b) => a.topMin - b.topMin || a.endMin - b.endMin);
    let cluster: typeof timedRaw = [];
    let clusterEnd = -1;
    const flush = () => {
      // greedy にレーンへ詰める
      const laneEnds: number[] = [];
      const assigned: { p: (typeof timedRaw)[number]; lane: number }[] = [];
      for (const p of cluster) {
        const dispEnd = Math.max(p.endMin, p.topMin + MIN_EVENT_MIN);
        let lane = laneEnds.findIndex((e) => e <= p.topMin);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(dispEnd);
        } else {
          laneEnds[lane] = dispEnd;
        }
        assigned.push({ p, lane });
      }
      const laneCount = laneEnds.length;
      for (const { p, lane } of assigned) {
        timed.push({ ...p, lane, laneCount });
      }
      cluster = [];
      clusterEnd = -1;
    };
    for (const p of arr) {
      const dispEnd = Math.max(p.endMin, p.topMin + MIN_EVENT_MIN);
      if (cluster.length === 0 || p.topMin < clusterEnd) {
        cluster.push(p);
        clusterEnd = Math.max(clusterEnd, dispEnd);
      } else {
        flush();
        cluster.push(p);
        clusterEnd = dispEnd;
      }
    }
    if (cluster.length) flush();
  }

  // 4) 終日／連日バー（上部帯）。列index範囲＋行スタック
  const allDayEvents = events
    .filter((e) => e.allDay)
    .sort((a, b) =>
      a.startAt < b.startAt ? -1 : a.startAt > b.startAt ? 1 : 0,
    );
  const allDayBars: AllDayBar[] = [];
  const rowEnds: number[] = []; // row -> 最後に埋まった列index
  for (const ev of allDayEvents) {
    const d1 = parseWall(ev.startAt).date;
    const d2 = ev.endAt ? parseWall(ev.endAt).date : d1;
    let startColIndex = -1;
    let endColIndex = -1;
    for (let i = 0; i < columns.length; i++) {
      const cd = columns[i].date;
      if (cmpDate(cd, d1) >= 0 && cmpDate(cd, d2) <= 0) {
        if (startColIndex === -1) startColIndex = i;
        endColIndex = i;
      }
    }
    if (startColIndex === -1) continue;
    let row = rowEnds.findIndex((e) => e < startColIndex);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(endColIndex);
    } else {
      rowEnds[row] = endColIndex;
    }
    allDayBars.push({ event: ev, startColIndex, endColIndex, row });
  }

  return {
    groups,
    columns,
    timed,
    transits: placedTransits,
    allDayBars,
    allDayRowCount: rowEnds.length,
    // 常に 0:00〜24:00。予定に応じた伸縮はしない。
    window: FULL_DAY_WINDOW,
  };
}
