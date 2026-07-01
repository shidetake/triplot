// 週ビューカレンダーのレイアウト計算（DB を触らない純粋関数）。
//
// 設計の肝 — 「壁時計（floating time）」を絶対に守る:
//  - イベント時刻はすべて「現地の壁時計＋そのTZ」。ここでは Date を「TZ変換目的で」
//    使わない（new Date(str) はローカルTZ解釈でズレる）。日付演算が要る所は
//    Date.UTC で UTC のみを使い、ローカルTZが入り込む経路を作らない。
//  - カレンダーは「絶対時間軸1本」ではなく「旅程ローカル日の列」。普通の日は1列。
//    フライト(transit)のうち「時差が戻って出発・到着の時間帯が壁時計上で重なる」
//    便だけ移動日を等幅2列（出発TZ側／到着TZ側）に割り、便はその間をリボンで
//    繋ぐ（同じ時間帯が2回現れるのを“隠さず正直に”2列で見せる）。時刻が前進する
//    便（西→東で1日進む等）は重なりが無いので日付を結合せず普通の日付列のまま、
//    便は列跨ぎリボンで描く。これで全日程で同じローカル時刻が同じ高さに揃う。

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
  // 予約管理: 紐づく予約TODOから導出。needsReservation=要予約 or 予約済の予定、
  // reservationDone=その予約TODOが done（=予約済）か。無ければ両方 false。
  needsReservation: boolean;
  reservationDone: boolean;
  // 参加者（部分集合）。空配列 = 「全員」のシュガー（明示メンバー無し）。
  // 1 件以上 = 明示的にその trip_members.id だけが当事者。
  participantMemberIds: string[];
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

/**
 * 0時からの通算分 → "H:MM"。時刻表示の単一ソース（分は常にゼロ埋め）。
 * padHour=true（既定）は時もゼロ埋めの "09:00"＝アプリ標準。
 * padHour=false は "9:00"＝高密度な週カレンダー軸だけが横幅を詰める例外。
 */
export function formatMinutes(min: number, padHour = true): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hh = padHour ? String(h).padStart(2, "0") : String(h);
  return `${hh}:${String(m).padStart(2, "0")}`;
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

/**
 * 壁時計文字列(TZ非依存)+IANA tz から真の絶対時刻(UTC ms)を求める。
 * 異なるTZの壁時計同士を正しい時系列で比較する（乗継の前後関係のソート）専用。
 * 壁時計の描画には使わない（ファイル冒頭の方針どおり Date は TZ変換の入口にしない）。
 */
function wallClockToUtcMs(wall: string, tz: string): number {
  const asUtc = new Date(`${wall}Z`).getTime();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(asUtc).map((x) => [x.type, x.value]));
  const readBackAsUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return asUtc - (readBackAsUtc - asUtc);
}

/** 移動イベントを実際の出発順（TZを跨いだ絶対時刻順）に並べる */
function sortTransitsByDepartureInstant(events: ScheduleEvent[]): ScheduleEvent[] {
  return [...events].sort(
    (a, b) =>
      wallClockToUtcMs(a.startAt, a.startTz) - wallClockToUtcMs(b.startAt, b.startTz),
  );
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

const WEEKDAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** "2026-04-27" → "4/27(月)"（ja）/ "4/27 Mon"（en） */
export function formatDayLabel(date: string, locale = "ja"): string {
  const [, mo, d] = date.split("-").map(Number);
  const idx = new Date(dateToUtc(date)).getUTCDay();
  if (locale === "en") return `${mo}/${d} ${WEEKDAY_EN[idx]}`;
  return `${mo}/${d}(${WEEKDAY_JA[idx]})`;
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
  /**
   * tzNote を何列ぶんの幅で見せるか（既定は columns.length）。前進する便は
   * 日付列を結合しないが、注記だけは出発日＋到着日の2列に跨げるよう 2 にする。
   */
  tzNoteSpan?: number;
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
  // 出発側ブロックが同じ列内で通常予定と重なるときのレーン（重なりが無ければ 0/1）。
  departLane: number;
  departLaneCount: number;
  arriveColumnKey: string;
  arriveMin: number;
  // 到着側ブロック（出発列と同一列のときは出発側と同じ値）のレーン。
  arriveLane: number;
  arriveLaneCount: number;
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

// 表示上の最低高さ（分換算）。レーン重なり判定でも使うため週カレンダー
// 側のゴースト合流計算と値を共有したいので export する。
export const MIN_EVENT_MIN = 30;
const DEFAULT_DURATION_MIN = 60; // end が無い時刻イベントの既定長
// 縦軸は常に 0:00〜24:00 固定（添付図と同じ。予定に応じて伸縮させない）。
const FULL_DAY_WINDOW = { startMin: 0, endMin: 24 * 60 };

// ──────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────

export function buildSchedule(
  events: ScheduleEvent[],
  opts: {
    tripStart?: string | null; // YYYY-MM-DD
    tripEnd?: string | null;
    locale?: string;
  },
): Schedule {
  const locale = opts.locale ?? "ja";
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
  // 壁時計の文字列比較ではなく実際の絶対時刻順（TZを跨いだ真の出発順）で並べる。
  const transits = sortTransitsByDepartureInstant(
    events.filter((e) => e.kind === "transit" && e.endAt && e.endTz),
  );

  const groups: ColumnGroup[] = [];
  // 直近に作った列。同日に連続で乗り継ぐ transit が到着列を再利用できるか判定するため追跡する。
  let lastCol: Column | null = null;

  const pushDay = (
    date: string,
    tz: string,
    tzNote: string | null = null,
    tzNoteSpan?: number,
  ): Column => {
    const col: Column = { key: `d-${date}`, date, tz, role: "day" };
    groups.push({
      key: `d-${date}`,
      label: formatDayLabel(date, locale),
      tzNote,
      tzNoteSpan,
      columns: [col],
    });
    lastCol = col;
    return col;
  };

  // 旅行TZ概念は持たない。普通の日の「現在TZ」は旅程から導出する:
  //  - 最初の時差移動より前 → その移動の出発TZ
  //  - 時差移動が無ければ → 最初の非終日イベントのTZ（無ければ UTC。
  //    単一列の日は列が1つなので、この値は配置に影響しない）
  const firstTz = events.find((e) => !e.allDay)?.startTz ?? "UTC";

  let cursor = rangeStart;
  let currentTz = transits.length > 0 ? transits[0].startTz : firstTz;

  // transit ごとに確定した乗降列key。後段のリボン配置はこれをそのまま使い、
  // (date,tz) だけのあいまいな再検索（同日に複数列あると誤爆する）に頼らない。
  const transitColumnKeys = new Map<string, { dep: string; arr: string }>();

  for (const t of transits) {
    const dep = parseWall(t.startAt);
    const arr = parseWall(t.endAt as string);
    const departDate = dep.date;
    const arriveDate = arr.date;
    const arriveTz = t.endTz as string;

    // transit までの普通の日
    while (cmpDate(cursor, departDate) < 0 && cmpDate(cursor, rangeEnd) <= 0) {
      pushDay(cursor, currentTz);
      cursor = addDays(cursor, 1);
    }

    // 直前に作った列が今回の出発(日付・TZ)とちょうど一致するなら、同日に
    // 連続で乗り継ぐ便として既存列を使い回す（新規列を作らずレーンを増やさない）。
    const depReused =
      lastCol !== null && lastCol.date === departDate && lastCol.tz === t.startTz;

    // 壁時計を1本の線形軸に並べたとき、到着が出発と同時かそれ以前に来るか。
    // ＝時差が戻って時刻が巻き戻り、出発と到着の時間帯が重なるケース。
    const dayDiff = (dateToUtc(arriveDate) - dateToUtc(departDate)) / 86400000;
    const wraps = dayDiff * 1440 + (arr.minutes - dep.minutes) <= 0;

    let depCol: Column;
    let arrCol: Column;

    if (wraps) {
      // 時差が戻る方向で時刻が重なる便だけ、重なりを正直に見せるため
      // 移動日を出発TZ側／到着TZ側の等幅2列に割る。
      depCol = depReused
        ? lastCol!
        : { key: `t-${t.id}-dep`, date: departDate, tz: t.startTz, role: "transit-depart" };
      arrCol = { key: `t-${t.id}-arr`, date: arriveDate, tz: arriveTz, role: "transit-arrive" };
      const label =
        departDate === arriveDate
          ? formatDayLabel(departDate, locale)
          : `${formatDayLabel(departDate, locale)} → ${formatDayLabel(arriveDate, locale)}`;
      groups.push({
        key: `t-${t.id}`,
        label,
        // 出発列を使い回すときは前の便の注記が既に出ているので重ねて出さない。
        tzNote: depReused ? null : `${t.startTz} → ${arriveTz}`,
        columns: depReused ? [arrCol] : [depCol, arrCol],
      });
      lastCol = arrCol;
    } else {
      // 時刻が前進する便は日付を結合しない。出発日（出発TZ）と到着日
      // （到着TZ）を普通の日付列として並べ、便は列を跨ぐ通常リボンで描く。
      // ただし「ここでTZが切り替わる」注記は wraps 便と対称に出す（出発日に）。
      // 注記は出発日＋到着日の2列ぶんの幅で見せる（列自体は結合しない）。
      // 空中で飛んだ暦日は列を作らない（消えた日を正直に表現）。
      // 同日内で時刻が進む便は1列のみ（到着TZは別列を持たず、同じ列内で描く）。
      const sameDay = arriveDate === departDate;
      depCol = depReused
        ? lastCol!
        : pushDay(departDate, t.startTz, `${t.startTz} → ${arriveTz}`, sameDay ? 1 : 2);
      arrCol = sameDay ? depCol : pushDay(arriveDate, arriveTz);
    }

    transitColumnKeys.set(t.id, { dep: depCol.key, arr: arrCol.key });

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

  // 3) 時刻イベント・時差移動の配置（重なりはレーン分割）。
  // 通常予定と時差移動は別々の見た目だが、同じ列・同じ時間帯を取り合う点は
  // 同じなので、両方を同じセグメント列に載せて1つのレーン割当アルゴリズムに
  // 通す（時差移動だけ全幅で描いて通常予定を覆い隠す、を避けるため）。
  type Segment =
    | {
        kind: "event";
        event: ScheduleEvent;
        columnKey: string;
        topMin: number;
        endMin: number;
      }
    | {
        // 出発列と到着列が同じ（同日内で完結する）便。1区間だけ。
        kind: "transit-single";
        transitId: string;
        columnKey: string;
        topMin: number;
        endMin: number;
      }
    | {
        // 出発列と到着列が別（wraps／日をまたぐ）便の出発側区間。
        kind: "transit-dep";
        transitId: string;
        columnKey: string;
        topMin: number;
        endMin: number;
      }
    | {
        // 同上の到着側区間。
        kind: "transit-arr";
        transitId: string;
        columnKey: string;
        topMin: number;
        endMin: number;
      };

  const timedRaw: Segment[] = [];
  const transitMeta = new Map<
    string,
    {
      event: ScheduleEvent;
      departColumnKey: string;
      departMin: number;
      arriveColumnKey: string;
      arriveMin: number;
    }
  >();

  for (const ev of events) {
    if (ev.allDay) continue;

    if (ev.kind === "transit" && ev.endAt && ev.endTz) {
      const dep = parseWall(ev.startAt);
      const arr = parseWall(ev.endAt);
      // 列生成時に確定した乗降列をそのまま使う。colFor の (date,tz) 検索は
      // 同日に複数列あると最初に見つかった列を誤って拾うことがあるため使わない。
      const keys = transitColumnKeys.get(ev.id);
      if (keys) {
        transitMeta.set(ev.id, {
          event: ev,
          departColumnKey: keys.dep,
          departMin: dep.minutes,
          arriveColumnKey: keys.arr,
          arriveMin: arr.minutes,
        });
        if (keys.dep === keys.arr) {
          timedRaw.push({
            kind: "transit-single",
            transitId: ev.id,
            columnKey: keys.dep,
            topMin: dep.minutes,
            endMin: arr.minutes,
          });
        } else {
          // 出発側ブロックは出発時刻〜その日の終わりまで、到着側ブロックは
          // 0:00〜到着時刻まで描画される（week-calendar.tsx の描画と対応）。
          timedRaw.push({
            kind: "transit-dep",
            transitId: ev.id,
            columnKey: keys.dep,
            topMin: dep.minutes,
            endMin: 24 * 60,
          });
          timedRaw.push({
            kind: "transit-arr",
            transitId: ev.id,
            columnKey: keys.arr,
            topMin: 0,
            endMin: arr.minutes,
          });
        }
      }
      continue;
    }

    const s = parseWall(ev.startAt);
    const e = ev.endAt ? parseWall(ev.endAt) : null;

    if (!e || e.date === s.date) {
      // 同日内
      const col = colFor(s.date, ev.startTz);
      if (!col) continue;
      const endMin =
        e && e.minutes > s.minutes
          ? e.minutes
          : s.minutes + DEFAULT_DURATION_MIN;
      timedRaw.push({
        kind: "event",
        event: ev,
        columnKey: col.key,
        topMin: s.minutes,
        endMin,
      });
      continue;
    }

    // 日跨ぎ（TZは跨がない）。日ごとに分割して描く:
    //  初日 [開始, 24:00] / 中日 [0:00, 24:00] / 最終日 [0:00, 終了]
    for (let d = s.date; cmpDate(d, e.date) <= 0; d = addDays(d, 1)) {
      const isFirst = d === s.date;
      const isLast = d === e.date;
      // 最終日 0:00 ちょうど終了は前日 24:00 までで終わり。空セグメントは出さない
      if (isLast && e.minutes === 0) break;
      const col = colFor(d, ev.startTz);
      if (!col) continue;
      timedRaw.push({
        kind: "event",
        event: ev,
        columnKey: col.key,
        topMin: isFirst ? s.minutes : 0,
        endMin: isLast ? e.minutes : 24 * 60,
      });
    }
  }

  // 列ごとに重なりクラスタを作ってレーン割当（通常予定・時差移動を区別しない）
  const timed: PlacedEvent[] = [];
  const transitLanes = new Map<
    string,
    {
      departLane: number;
      departLaneCount: number;
      arriveLane: number;
      arriveLaneCount: number;
    }
  >();
  const byColumn = new Map<string, Segment[]>();
  for (const p of timedRaw) {
    const arr = byColumn.get(p.columnKey) ?? [];
    arr.push(p);
    byColumn.set(p.columnKey, arr);
  }
  for (const arr of byColumn.values()) {
    arr.sort((a, b) => a.topMin - b.topMin || a.endMin - b.endMin);
    let cluster: Segment[] = [];
    let clusterEnd = -1;
    const flush = () => {
      // greedy にレーンへ詰める
      const laneEnds: number[] = [];
      const assigned: { p: Segment; lane: number }[] = [];
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
        if (p.kind === "event") {
          timed.push({
            event: p.event,
            columnKey: p.columnKey,
            topMin: p.topMin,
            endMin: p.endMin,
            lane,
            laneCount,
          });
          continue;
        }
        const cur = transitLanes.get(p.transitId) ?? {
          departLane: 0,
          departLaneCount: 1,
          arriveLane: 0,
          arriveLaneCount: 1,
        };
        if (p.kind === "transit-single") {
          cur.departLane = lane;
          cur.departLaneCount = laneCount;
          cur.arriveLane = lane;
          cur.arriveLaneCount = laneCount;
        } else if (p.kind === "transit-dep") {
          cur.departLane = lane;
          cur.departLaneCount = laneCount;
        } else {
          cur.arriveLane = lane;
          cur.arriveLaneCount = laneCount;
        }
        transitLanes.set(p.transitId, cur);
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

  const placedTransits: PlacedTransit[] = [...transitMeta.values()].map(
    (m) => {
      const lanes = transitLanes.get(m.event.id) ?? {
        departLane: 0,
        departLaneCount: 1,
        arriveLane: 0,
        arriveLaneCount: 1,
      };
      return { ...m, ...lanes };
    },
  );

  // 4) 終日／連日バー（上部帯）。列index範囲＋行スタック
  // 期間が長いほど上の段に来るよう「長さ DESC → 開始日 ASC」でソート。
  // greedy で先頭から row 0 に詰めるので、長い予定が自然と最上段に乗る。
  const allDayEvents = events
    .filter((e) => e.allDay)
    .sort((a, b) => {
      const aStart = parseWall(a.startAt).date;
      const aEnd = a.endAt ? parseWall(a.endAt).date : aStart;
      const bStart = parseWall(b.startAt).date;
      const bEnd = b.endAt ? parseWall(b.endAt).date : bStart;
      const aLen = dateToUtc(aEnd) - dateToUtc(aStart);
      const bLen = dateToUtc(bEnd) - dateToUtc(bStart);
      if (aLen !== bLen) return bLen - aLen;
      return a.startAt < b.startAt ? -1 : a.startAt > b.startAt ? 1 : 0;
    });
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

// ──────────────────────────────────────────────
// 旅程のTZタイムライン（費用の壁時計→絶対時刻の解決に使う）
// ──────────────────────────────────────────────

/** 旅程から導いた、日付→TZ を引くための最小情報（serializable）。 */
export type TripTzTimeline = {
  /** transit が無い時の既定TZ（最初の非終日イベント由来、無ければ UTC） */
  fallbackTz: string;
  /** 出発時刻順に並んだ移動。各区間の境界になる */
  transits: {
    departDate: string;
    arriveDate: string;
    departTz: string;
    arriveTz: string;
  }[];
};

export function buildTripTzTimeline(events: ScheduleEvent[]): TripTzTimeline {
  const transits = sortTransitsByDepartureInstant(
    events.filter((e) => e.kind === "transit" && e.endAt && e.endTz),
  )
    .map((t) => ({
      departDate: parseWall(t.startAt).date,
      arriveDate: parseWall(t.endAt as string).date,
      departTz: t.startTz,
      arriveTz: t.endTz as string,
    }));
  const fallbackTz = events.find((e) => !e.allDay)?.startTz ?? "UTC";
  return { fallbackTz, transits };
}

export type TzResolution =
  | { kind: "single"; tz: string }
  // 同一暦日に複数のTZを跨ぐ乗継日。時系列順の候補（2件以上）から選ばせる。
  | { kind: "ambiguous"; options: string[] };

/**
 * その日付に費用が発生したと仮定したときの現地TZを旅程から引く。
 * 乗継日（出発日==到着日の移動を含む日）だけは一意に決まらないので ambiguous を返す。
 * 同日に複数回乗り継ぐ（3つ以上のTZを跨ぐ）場合も、その日に触れる全TZを時系列順に集める。
 */
export function resolveExpenseTz(
  date: string,
  tl: TripTzTimeline,
): TzResolution {
  const { transits, fallbackTz } = tl;
  if (transits.length === 0) return { kind: "single", tz: fallbackTz };

  // 最初の移動より前は、その移動の出発TZにいる。
  let currentTz = transits[0].departTz;
  // その日に触れた全TZを時系列順に集める（隣接重複は除く）。
  const touched: string[] = [];
  const push = (tz: string) => {
    if (touched[touched.length - 1] !== tz) touched.push(tz);
  };

  for (const t of transits) {
    if (cmpDate(date, t.departDate) < 0) {
      // これ以降の移動は date に関係ない
      break;
    }
    if (date === t.departDate && date === t.arriveDate) {
      // 出発・到着とも同一暦日の乗継。同日に続く別の乗継があるかもしれないので走査を続ける。
      push(t.departTz);
      push(t.arriveTz);
      currentTz = t.arriveTz;
      continue;
    }
    if (date === t.departDate) {
      // 日をまたぐ移動の出発日。以降は機中でこの日のTZは確定しない
      // → 出発側のみ確定し、この日の走査を打ち切る（次の乗継は翌日以降にしかあり得ない）。
      push(t.departTz);
      break;
    }
    if (cmpDate(date, t.departDate) > 0 && cmpDate(date, t.arriveDate) < 0) {
      // 暦日まるごと空の上 → 到着側に寄せて確定
      push(t.arriveTz);
      break;
    }
    if (date === t.arriveDate) {
      // 日をまたぐ移動の到着日。同日に続けて乗り継ぐかもしれないので走査を続ける。
      push(t.arriveTz);
      currentTz = t.arriveTz;
      continue;
    }
    // この移動は date より前に完結している → 到着TZへ進んで次の移動を見る
    currentTz = t.arriveTz;
  }

  if (touched.length === 0) return { kind: "single", tz: currentTz };
  if (touched.length === 1) return { kind: "single", tz: touched[0] };
  return { kind: "ambiguous", options: touched };
}
