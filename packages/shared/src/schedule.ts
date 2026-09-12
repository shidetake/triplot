import { tzDisplayLabel } from "./timezones";

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
  // IANA。**transit だけが literal な TZ を持つ**（旅行のTZ境界の唯一の真実源）。
  // normal/allday は常に null で、実効TZは旅程（transit の並び）と tzDisambig*
  // から毎回導出する（resolveEventTz）。DB の CHECK 制約
  // events_normal_no_literal_tz_chk / events_transit_endpoints_chk がこの不変条件を
  // 強制している。
  startTz: string | null;
  endTz: string | null; // transit の到着TZ。normal は null
  // normal/allday のみ意味を持つ。乗継当日で候補が複数あるときの選択（どの
  // 乗継の出発側/到着側か）。非曖昧な日は null のまま（旅程から自動導出）。
  tzDisambigTransitId: string | null;
  tzDisambigSide: "depart" | "arrive" | null;
  // 出発地。単一地点の予定ではその場所。
  startPlaceId: string | null;
  // 到着地。**null は「startPlaceId と同じ」**の意味（DB に二重に持たない）。
  // 実効の到着地は eventEndPlaceId() で取ること。
  endPlaceId: string | null;
  visibility: "shared" | "private";
  note: string | null;
  // 予約管理: 紐づく予約TODOから導出。needsReservation=要予約 or 予約済の予定、
  // reservationDone=その予約TODOが done（=予約済）か。無ければ両方 false。
  needsReservation: boolean;
  reservationDone: boolean;
  // 参加者（部分集合）。空配列 = 「全員」のシュガー（明示メンバー無し）。
  // 1 件以上 = 明示的にその trip_members.id だけが当事者。
  participantsEveryone: boolean;
  participantMemberIds: string[];
  // メール取り込みの未確定下書き（inbound_drafts）から作った表示専用の疑似イベント。
  // DB には存在しない。カレンダー上は warning(amber)+破線で表示し、タップで
  // 確定フォームを開く（週カレンダー描画側の関心事なので判定はそちら）。
  isDraft?: boolean;
};

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

// ──────────────────────────────────────────────
// 壁時計・日付ユーティリティ（UTC のみ。ローカルTZ非依存）
// ──────────────────────────────────────────────

/** "YYYY-MM-DDTHH:MM[:SS]" → 日付文字列と「0時からの分」 */
export function parseWall(s: string): { date: string; minutes: number } {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
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
 * 異なるTZの壁時計同士を正しい時系列で比較する（乗継の前後関係のソート、
 * 費用の発生順ソート）専用。壁時計の描画には使わない（ファイル冒頭の方針
 * どおり Date は TZ変換の入口にしない）。
 */
export function wallClockToUtcMs(wall: string, tz: string): number {
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
  const p = Object.fromEntries(
    fmt.formatToParts(asUtc).map((x) => [x.type, x.value]),
  );
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

/**
 * wallClockToUtcMs の逆。絶対時刻(UTC ms) を指定 TZ の壁時計
 * "YYYY-MM-DDTHH:MM" にする。
 *
 * 「出発の壁時計＋所要時間」から到着の壁時計を出すのに要る（フライトの
 * 取り込み）。到着地の現地時刻をそのまま写すと、参照した日と対象日で
 * サマータイムの有無が違ったとき1時間ずれるので、所要時間で足してから
 * 到着地の TZ で読み直す。
 */
export function utcMsToWallClock(ms: number, tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const p = Object.fromEntries(
    fmt.formatToParts(ms).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * 移動イベントを実際の出発順（TZを跨いだ絶対時刻順）に並べる。
 * kind='transit' の startTz は DB 制約で必ず非null（呼び出し側は transit で
 * フィルタ済みの配列を渡す前提）。
 */
function sortTransitsByDepartureInstant(
  events: ScheduleEvent[],
): ScheduleEvent[] {
  return [...events].sort(
    (a, b) =>
      wallClockToUtcMs(a.startAt, a.startTz as string) -
      wallClockToUtcMs(b.startAt, b.startTz as string),
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
  /**
   * この日、メンバーの年表が分かれているか（同じ時間帯に居られる人が全員では
   * ない）。分かれている日だけ「誰の時間で見ているか」を添える。
   * buildSchedule に memberIds を渡した時だけ判定する（渡さなければ false）。
   */
  diverged: boolean;
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

// 旅程の TZ 境界として扱う移動か。
//
// **時差が無ければ境界ではない。** 配車・タクシー・在来線も種別は「移動」だが
// （ユーザーが移動と言ったものを別の種別にはしない）、出発と到着で TZ が同じなら
// 「ここから先はこの TZ」という区切りを作らない。境界として扱うと、その移動が
// 持つ TZ で以降の日が塗り替えられる（実データ: ホノルル滞在中の Uber が「東京」の
// TZ を持っていて、そこから先の日が全部東京の列になった）。
//
// 保存時の規約（crossesTimezone）と同じ判定を、旅程を組む側でも使う。
export function isTzBoundary(
  e: ScheduleEvent,
): e is ScheduleEvent & { endAt: string; startTz: string; endTz: string } {
  return (
    e.kind === "transit" &&
    !!e.startTz &&
    !!e.endTz &&
    !!e.endAt &&
    e.startTz !== e.endTz
  );
}

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
  inputEvents: ScheduleEvent[],
  opts: {
    tripStart?: string | null; // YYYY-MM-DD
    tripEnd?: string | null;
    locale?: string;
    /** 旅程に transit が1つも無い旅行の唯一の拠り所（trips.default_timezone） */
    defaultTimezone?: string | null;
    /**
     * **誰の年表で列を組むか。** 年表は人ごと（timelineFor）なので、列（日付と
     * その日の時間帯）は見ている人の年表から組む。省略すると旅行全体（全員ぶんの
     * 移動の和＝従来どおり）。見ている人が乗っていない移動や、別の時間帯にいる
     * 人の予定は、絶対時刻を見ている人の壁時計に直して置く。
     */
    viewerMemberId?: string | null;
    /** 旅行のアクティブメンバー。年表が分かれている日（diverged）の判定に使う。 */
    memberIds?: readonly string[];
  },
): Schedule {
  const locale = opts.locale ?? "ja";
  // **TZ が変わらない移動は、旅程の上では通常の予定として扱う。**
  //
  // 配車・タクシー・在来線も種別は「移動」で保存される（ユーザーがそう言って
  // いるものを勝手に別の種別にしない）。ただし列を作る側では別で、移動は
  // 「ここから先はこの TZ」という境界として現在の TZ を書き換える。時差の無い
  // 移動にそれをさせると、**その移動が持つ TZ でその日以降が塗り替えられる**
  // （実データで、ホノルル滞在中の Uber が「東京」の TZ を持っていて、そこから
  // 先の日が全部東京の列になった）。
  //
  // 境界でない移動をここで通常の予定に均しておけば、列も年表もリボンも
  // まとめて正しくなる（下流の分岐を1つ1つ直して回らない）。
  // normal/allday 予定は startTz を持たない（旅程から自動導出する）ので、
  // 列配置のたびにこれで実際のTZを解決する。
  const tzTimeline = buildTripTzTimeline(inputEvents, opts.defaultTimezone);
  const events = inputEvents;

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
  // 境界を作る移動だけが列を割る。時差の無い移動は下の通常の予定と同じ扱い。
  // 列を組む移動は**見ている人の年表**のもの（timelineFor）。他の人だけの
  // 移動は列を割らず、下で絶対時刻からこの人の列に写す。
  const viewerTl = opts.viewerMemberId
    ? timelineFor(tzTimeline, [opts.viewerMemberId])
    : tzTimeline;
  const viewerTransitIds = new Set(viewerTl.transits.map((t) => t.transitId));
  const transits = sortTransitsByDepartureInstant(
    events.filter(isTzBoundary).filter((t) => viewerTransitIds.has(t.id)),
  );

  const groups: ColumnGroup[] = [];
  // 直近に作った列。同日に連続で乗り継ぐ transit が到着列を再利用できるか判定するため追跡する。
  let lastCol: Column | null = null;
  // 同じ暦日を指す普通の日列は1つに重複排除する（例: 同じ日に発着する2便が
  // 別々に確定済み/未確定下書きとして存在すると、素朴には同じ date で pushDay
  // が2回呼ばれ得る。React の key 重複を防ぐため、date 単位で列を使い回す）。
  const dayColumnsByDate = new Map<string, Column>();

  const pushDay = (
    date: string,
    tz: string,
    tzNote: string | null = null,
    tzNoteSpan?: number,
  ): Column => {
    const existing = dayColumnsByDate.get(date);
    if (existing) {
      lastCol = existing;
      return existing;
    }
    const col: Column = { key: `d-${date}`, date, tz, role: "day" };
    dayColumnsByDate.set(date, col);
    groups.push({
      key: `d-${date}`,
      label: formatDayLabel(date, locale),
      tzNote,
      tzNoteSpan,
      diverged: false,
      columns: [col],
    });
    lastCol = col;
    return col;
  };

  // 普通の日の「現在TZ」は旅程から導出する:
  //  - 最初の時差移動より前 → その移動の出発TZ
  //  - 時差移動が無ければ → trips.default_timezone（tzTimeline.fallbackTz）
  const firstTz = viewerTl.fallbackTz;

  let cursor = rangeStart;
  // transit の startTz は DB 制約で必ず非null。
  let currentTz =
    transits.length > 0 ? (transits[0].startTz as string) : firstTz;

  // transit ごとに確定した乗降列key。後段のリボン配置はこれをそのまま使い、
  // (date,tz) だけのあいまいな再検索（同日に複数列あると誤爆する）に頼らない。
  const transitColumnKeys = new Map<string, { dep: string; arr: string }>();

  for (const t of transits) {
    const dep = parseWall(t.startAt);
    const arr = parseWall(t.endAt as string);
    const departDate = dep.date;
    const arriveDate = arr.date;
    const startTz = t.startTz as string; // DB 制約で必ず非null
    const arriveTz = t.endTz as string;

    // transit までの普通の日
    while (cmpDate(cursor, departDate) < 0 && cmpDate(cursor, rangeEnd) <= 0) {
      pushDay(cursor, currentTz);
      cursor = addDays(cursor, 1);
    }

    // 直前に作った列が今回の出発(日付・TZ)とちょうど一致するなら、同日に
    // 連続で乗り継ぐ便として既存列を使い回す（新規列を作らずレーンを増やさない）。
    const depReused =
      lastCol !== null && lastCol.date === departDate && lastCol.tz === startTz;

    // 壁時計を1本の線形軸に並べたとき、到着が出発と同時かそれ以前に来るか。
    // ＝時差が戻って時刻が巻き戻り、出発と到着の時間帯が重なるケース。
    const dayDiff = (dateToUtc(arriveDate) - dateToUtc(departDate)) / 86400000;
    const wraps = dayDiff * 1440 + (arr.minutes - dep.minutes) <= 0;

    let depCol: Column;
    let arrCol: Column;

    // TZ の境界は**時差がある時だけ意味を持つ**。同じ TZ 内の移動（配車・
    // タクシー・在来線）でも kind は transit なので、そのまま書くと
    // 「Asia/Tokyo → Asia/Tokyo」のような情報ゼロの注記がカレンダーの
    // 日付欄に並ぶ（実機で確認）。同じなら出さない。
    const tzBoundaryNote =
      startTz === arriveTz
        ? null
        : // 画面に出すのは表示名（「日本 → ハワイ」）。IANA の識別子は内部の
          // 表現で、ユーザーに見せるものではない（タイムゾーンピッカーと
          // 同じ名前を使う。docs/ui-guidelines.md「タイムゾーンピッカーの
          // 命名ルール」）。
          `${tzDisplayLabel(startTz, locale)} → ${tzDisplayLabel(arriveTz, locale)}`;

    if (wraps) {
      // 時差が戻る方向で時刻が重なる便だけ、重なりを正直に見せるため
      // 移動日を出発TZ側／到着TZ側の等幅2列に割る。
      depCol = depReused
        ? lastCol!
        : {
            key: `t-${t.id}-dep`,
            date: departDate,
            tz: startTz,
            role: "transit-depart",
          };
      arrCol = {
        key: `t-${t.id}-arr`,
        date: arriveDate,
        tz: arriveTz,
        role: "transit-arrive",
      };
      const label =
        departDate === arriveDate
          ? formatDayLabel(departDate, locale)
          : `${formatDayLabel(departDate, locale)} → ${formatDayLabel(arriveDate, locale)}`;
      groups.push({
        key: `t-${t.id}`,
        label,
        // 出発列を使い回すときは前の便の注記が既に出ているので重ねて出さない。
        tzNote: depReused ? null : tzBoundaryNote,
        diverged: false,
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
        : pushDay(departDate, startTz, tzBoundaryNote, sameDay ? 1 : 2);
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

  // 年表が分かれている日。各メンバーがその日に居られる時間帯の集合（移動日は
  // 出発側と到着側の両方）を取り、全員に共通の時間帯が無ければ分かれている。
  // 「同じ時間帯 ≠ 同じ場所」なので合流の判定には使わない。ここで要るのは
  // 「別の時間帯にいる人がいる」という向きだけで、それは確実に言える。
  if (opts.memberIds && opts.memberIds.length > 1) {
    const memberTls = opts.memberIds.map((m) => timelineFor(tzTimeline, [m]));
    const divergedOn = (date: string): boolean => {
      const sets = memberTls.map((tl) => {
        const r = resolveExpenseTz(date, tl);
        return new Set<string>(
          r.kind === "single" ? [r.tz] : r.options.map((o) => o.tz),
        );
      });
      return !Array.from(sets[0]).some((tz) => sets.every((s) => s.has(tz)));
    };
    for (const g of groups) {
      g.diverged = g.columns.some((c) => divergedOn(c.date));
    }
  }

  // 日付＋TZ → 列。普通日/transit列いずれにも当たるよう (date,tz) で引く
  const colFor = (date: string, tz: string): Column | undefined =>
    columns.find((c) => c.date === date && c.tz === tz) ??
    columns.find((c) => c.date === date); // TZ未一致でも日付一致なら拾う保険

  // 絶対時刻 → 見ている人の列。別の時間帯にいる人の予定・見ている人が乗って
  // いない移動は壁時計では置けない（その時間帯の列が無い）ので、絶対時刻に
  // 直してからこの人の列に写す。各列の絶対時刻の範囲は「その日の 0:00〜24:00
  // をその列の TZ で読んだもの」。移動日の2列は範囲が重なるので、出発前は
  // 出発側・到着後は到着側・機内は出発側に倒す。
  const colRange = new Map(
    columns.map((c) => [
      c.key,
      {
        start: wallClockToUtcMs(`${c.date}T00:00`, c.tz),
        end: wallClockToUtcMs(`${addDays(c.date, 1)}T00:00`, c.tz),
      },
    ]),
  );
  const departAtCol = new Map<string, number>();
  const arriveAtCol = new Map<string, number>();
  for (const t of transits) {
    const keys = transitColumnKeys.get(t.id)!;
    departAtCol.set(keys.dep, wallClockToUtcMs(t.startAt, t.startTz as string));
    arriveAtCol.set(
      keys.arr,
      wallClockToUtcMs(t.endAt as string, t.endTz as string),
    );
  }
  const colAtInstant = (ms: number): Column | undefined => {
    const cands = columns.filter((c) => {
      const r = colRange.get(c.key)!;
      return ms >= r.start && ms < r.end;
    });
    if (cands.length <= 1) return cands[0];
    const after = cands.find((c) => {
      const a = arriveAtCol.get(c.key);
      return a != null && ms >= a;
    });
    if (after) return after;
    const before = cands.find((c) => {
      const d = departAtCol.get(c.key);
      return d != null && ms < d;
    });
    return before ?? cands[0];
  };
  // その列の TZ で読んだ 0:00 からの通算分。列の範囲内の絶対時刻に限る。
  const minutesIn = (ms: number, col: Column): number =>
    parseWall(utcMsToWallClock(ms, col.tz)).minutes;
  // [startMs, endMs) を見ている人の列に写して区間に割る。列の境界（その列の
  // 24:00）で切り、続きは次の列へ。列が無い時刻（範囲外）は捨てる。
  const placeByInstant = (
    startMs: number,
    endMs: number,
    push: (columnKey: string, topMin: number, endMin: number) => void,
  ) => {
    let ms = startMs;
    for (let guard = 0; ms < endMs && guard < 64; guard++) {
      const col = colAtInstant(ms);
      if (!col) break;
      const r = colRange.get(col.key)!;
      const segEnd = Math.min(endMs, r.end);
      push(
        col.key,
        minutesIn(ms, col),
        segEnd === r.end ? 24 * 60 : minutesIn(segEnd, col),
      );
      ms = segEnd;
    }
  };
  // その予定は見ている人と同じ時間の流れに乗っているか（見ている人が参加者
  // なら同じ年表＝壁時計のまま置ける）。
  const sharesViewerFrame = (ev: ScheduleEvent): boolean =>
    opts.viewerMemberId == null ||
    ev.participantsEveryone ||
    ev.participantMemberIds.includes(opts.viewerMemberId);

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

    if (isTzBoundary(ev)) {
      const dep = parseWall(ev.startAt);
      const arr = parseWall(ev.endAt);
      // 列生成時に確定した乗降列をそのまま使う。colFor の (date,tz) 検索は
      // 同日に複数列あると最初に見つかった列を誤って拾うことがあるため使わない。
      let keys = transitColumnKeys.get(ev.id);
      let depMin = dep.minutes;
      let arrMin = arr.minutes;
      if (!keys) {
        // 見ている人が乗っていない移動。列を割っていないので、出発と到着の
        // 絶対時刻をこの人の列に写す（例: 自分がハワイにいる日の、友達の
        // 東京 19:10 発は、ハワイの列の 0:10 に出る）。
        const depMs = wallClockToUtcMs(ev.startAt, ev.startTz);
        const arrMs = wallClockToUtcMs(ev.endAt, ev.endTz);
        const depCol = colAtInstant(depMs);
        const arrCol = colAtInstant(arrMs);
        if (!depCol || !arrCol) continue;
        keys = { dep: depCol.key, arr: arrCol.key };
        depMin = minutesIn(depMs, depCol);
        arrMin = minutesIn(arrMs, arrCol);
      }
      {
        transitMeta.set(ev.id, {
          event: ev,
          departColumnKey: keys.dep,
          departMin: depMin,
          arriveColumnKey: keys.arr,
          arriveMin: arrMin,
        });
        if (keys.dep === keys.arr) {
          timedRaw.push({
            kind: "transit-single",
            transitId: ev.id,
            columnKey: keys.dep,
            topMin: depMin,
            endMin: arrMin,
          });
        } else {
          // 出発側ブロックは出発時刻〜その日の終わりまで、到着側ブロックは
          // 0:00〜到着時刻まで描画される（week-calendar.tsx の描画と対応）。
          timedRaw.push({
            kind: "transit-dep",
            transitId: ev.id,
            columnKey: keys.dep,
            topMin: depMin,
            endMin: 24 * 60,
          });
          timedRaw.push({
            kind: "transit-arr",
            transitId: ev.id,
            columnKey: keys.arr,
            topMin: 0,
            endMin: arrMin,
          });
        }
      }
      continue;
    }

    const s = parseWall(ev.startAt);
    const e = ev.endAt ? parseWall(ev.endAt) : null;
    // 通常の予定は TZ を持たず旅程から導出する。**例外は、時差が無いので通常の
    // 予定として扱っている移動**（上の均し）。自分の TZ を知っているので、
    // 導出より本人の申告を採る。
    //
    // 導出に使う年表は**その予定の参加者のもの**（timelineFor 参照）。列の
    // 並びは旅行全体の移動から組んでいるが、予定がどの時間帯にいるかは、その
    // 予定に出る人がどの移動に乗ったかで決まる。
    const evTz =
      ev.startTz ??
      resolveEventTz(
        s.date,
        ev.tzDisambigTransitId,
        ev.tzDisambigSide,
        timelineForEvent(tzTimeline, ev),
      );

    // 見ている人の列にその時間帯が無い＝別の時間帯にいる人の予定。絶対時刻に
    // 直してこの人の列に写す（同じ流れに乗っている予定は、列の TZ が形式上
    // 違っても壁時計のまま置く＝従来どおり。同日に時刻が進む便の到着側など）。
    const exact = columns.some((c) => c.date === s.date && c.tz === evTz);
    if (!exact && !sharesViewerFrame(ev)) {
      const startMs = wallClockToUtcMs(ev.startAt, evTz);
      const endMs = e
        ? Math.max(wallClockToUtcMs(ev.endAt as string, evTz), startMs)
        : startMs;
      placeByInstant(
        startMs,
        endMs > startMs ? endMs : startMs + DEFAULT_DURATION_MIN * 60_000,
        (columnKey, topMin, endMin) =>
          timedRaw.push({ kind: "event", event: ev, columnKey, topMin, endMin }),
      );
      continue;
    }

    if (!e || e.date === s.date) {
      // 同日内
      const col = colFor(s.date, evTz);
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
      const col = colFor(d, evTz);
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

  const placedTransits: PlacedTransit[] = [...transitMeta.values()].map((m) => {
    const lanes = transitLanes.get(m.event.id) ?? {
      departLane: 0,
      departLaneCount: 1,
      arriveLane: 0,
      arriveLaneCount: 1,
    };
    return { ...m, ...lanes };
  });

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
    // 複数日にわたる終日予定（宿泊等）の初日が、時差が戻る乗継の当日
    // （出発TZ側／到着TZ側の等幅2列）なら、出発側の列は飛ばして到着側の
    // 列から始める。移動してからチェックインする、という実際の順序を
    // 見た目にも反映する（placeOrder.ts の「初日の最後」扱いと対の見た目）。
    // 単日の終日予定・split の無い日は対象外（従来通り列の先頭から）。
    const isMultiDay = d1 !== d2;
    let startColIndex = -1;
    let endColIndex = -1;
    for (let i = 0; i < columns.length; i++) {
      const c = columns[i];
      if (cmpDate(c.date, d1) >= 0 && cmpDate(c.date, d2) <= 0) {
        if (isMultiDay && c.date === d1 && c.role === "transit-depart") {
          continue;
        }
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
  /** transit が無い時の唯一の拠り所（trips.default_timezone、無ければ UTC） */
  fallbackTz: string;
  /** 出発時刻順に並んだ移動。各区間の境界になる */
  transits: {
    transitId: string;
    departDate: string;
    arriveDate: string;
    departTz: string;
    arriveTz: string;
    /** 壁時計 "HH:MM"。移動日の候補を時刻で絞るのに使う（narrowTzByTime）。 */
    departTime: string;
    arriveTime: string;
    /**
     * その移動に乗った人（ScheduleEvent の参加者そのまま）。年表を人ごとに
     * 絞る（timelineFor）ための唯一の材料で、「誰がどの移動に乗ったか」以外の
     * 状態は持たない。
     */
    participantsEveryone: boolean;
    participantMemberIds: string[];
  }[];
};

export function buildTripTzTimeline(
  events: ScheduleEvent[],
  defaultTimezone?: string | null,
): TripTzTimeline {
  const transits = sortTransitsByDepartureInstant(
    events.filter(
      (e) =>
        e.kind === "transit" &&
        e.endAt &&
        e.endTz &&
        // **TZ が変わらない移動は年表に入れない。** 年表は「境界」の列で、
        // 各要素が現在の TZ を書き換える。同じ TZ 内の移動（配車・タクシー・
        // 在来線）は境界を作らないのに、入れると現在の TZ を自分の値で
        // 上書きしてしまう。
        //
        // 上書きが害になるのは、その値が推測だから。取り込みの移動の TZ は
        // 乗降地から LLM が推定したもので、外すことがあるうえ、取れなければ
        // 旅行の既定 TZ に落ちる。実データでは、ホノルル滞在中の Uber が
        // TZ 不明のまま「東京」として年表に入り、**そこから先の日が全部東京に
        // 戻って**いた（フライトが示した境界が乗車で打ち消された）。
        e.startTz !== e.endTz,
    ),
  ).map((t) => ({
    transitId: t.id,
    departDate: parseWall(t.startAt).date,
    arriveDate: parseWall(t.endAt as string).date,
    departTz: t.startTz as string,
    arriveTz: t.endTz as string,
    departTime: formatMinutes(parseWall(t.startAt).minutes),
    arriveTime: formatMinutes(parseWall(t.endAt as string).minutes),
    participantsEveryone: t.participantsEveryone,
    participantMemberIds: t.participantMemberIds,
  }));
  return { fallbackTz: defaultTimezone ?? "UTC", transits };
}

/**
 * **年表は人ごとにある。** 旅行に1本ではなく、その人が乗った移動だけを並べた
 * ものがその人の年表。途中で合流・離脱する旅行では同じ瞬間に別の時間帯にいる
 * 人がいるので、「旅行がどこにいたか」は問いとして成立せず、「誰が」を添えて
 * 初めて答えが決まる。
 *
 * 事実は移動の参加者が持っている（新しいテーブルは無い）ので、旅行全体の年表
 * （buildTripTzTimeline＝全員ぶんの移動の和）から都度絞る。全員参加の移動しか
 * 無い旅行では誰の年表も同じ＝絞っても変わらない。
 *
 * 誰の年表を使うかは対象で決まる:
 *
 * | 対象 | 使う年表 |
 * |---|---|
 * | 予定 | その予定の参加者（timelineForEvent） |
 * | 費用 | 支払った人（どこで払ったかは払った人の居場所） |
 * | 取り込みの現地化 | 転送した本人＝自分 |
 * | 場所の検索の地理バイアス | 探している本人＝自分 |
 *
 * `memberIds` が null（＝全員）なら絞らない。複数人を渡したときは**その誰かが
 * 乗った移動**を全部残す（和）。同じ予定に入っている人は同じ場所にいるはずなの
 * で、各自を連れてきた移動をまとめて並べればその予定の年表になる。食い違う
 * （別の土地にいる人が同じ予定に入っている）のは参加者の付け忘れで、年表の側
 * では判定しない。
 *
 * 絞った結果が元と同じなら同じオブジェクトを返す（React のメモ化が効くように）。
 */
export function timelineFor(
  tl: TripTzTimeline,
  memberIds: readonly string[] | null | undefined,
): TripTzTimeline {
  if (memberIds == null || memberIds.length === 0) return tl;
  const transits = tl.transits.filter(
    (t) =>
      t.participantsEveryone ||
      t.participantMemberIds.some((id) => memberIds.includes(id)),
  );
  return transits.length === tl.transits.length
    ? tl
    : { fallbackTz: tl.fallbackTz, transits };
}

/** その予定の参加者の年表（timelineFor 参照）。全員参加なら旅行全体の年表。 */
export function timelineForEvent(
  tl: TripTzTimeline,
  e: Pick<ScheduleEvent, "participantsEveryone" | "participantMemberIds">,
): TripTzTimeline {
  return e.participantsEveryone ? tl : timelineFor(tl, e.participantMemberIds);
}

/**
 * **その瞬間、旅行はどのタイムゾーンに居たか。**
 *
 * 日付ではなく絶対時刻で引く。移動の予定は両端に実タイムゾーンを持つ＝境界も
 * 絶対時刻なので、現地の日付が分からなくても「どちら側か」は決まる。移動日
 * （同じ暦日に2つのタイムゾーンが並ぶ日）が日付では決められないのと対照的で、
 * 決済通知の送信時刻のように**瞬間しか分かっていない**手がかりはこちらで引く。
 *
 * 決められない時は null を返す:
 *   - 移動が1本も無い（旅行の既定タイムゾーンは作った端末の値＝推測なので、
 *     居場所の根拠にしない）
 *   - その瞬間が移動の最中（出発と到着の間）＝どちらの土地でもない
 */
export function tzAtInstant(
  timeline: TripTzTimeline,
  ms: number,
): string | null {
  const transits = timeline.transits;
  if (transits.length === 0 || !Number.isFinite(ms)) return null;
  // 最初の出発より前は出発側の土地に居る。
  let tz = transits[0].departTz;
  for (const t of transits) {
    const depart = wallClockToUtcMs(
      `${t.departDate}T${t.departTime}`,
      t.departTz,
    );
    const arrive = wallClockToUtcMs(
      `${t.arriveDate}T${t.arriveTime}`,
      t.arriveTz,
    );
    if (ms < depart) return tz;
    if (ms < arrive) return null;
    tz = t.arriveTz;
  }
  return tz;
}

/** 乗継日の候補1件。どの乗継の出発側/到着側かという出自を保つ（DB保存用の参照に使う）。 */
export type TzCandidate = {
  tz: string;
  transitId: string;
  side: "depart" | "arrive";
};

export type TzResolution =
  | { kind: "single"; tz: string }
  // 同一暦日に複数のTZを跨ぐ乗継日。時系列順の候補（2件以上）から選ばせる。
  | { kind: "ambiguous"; options: TzCandidate[] };

/**
 * 同じ TZ を指す候補を1つに畳む（表示用）。移動が同一暦日に複数あると
 * 「日本/ハワイ/日本/ハワイ」のように同じ TZ の選択肢が重複して並ぶが、
 * どの候補を選んでも解決される TZ は同じなので先頭だけ残せばよい。
 */
export function dedupeTzCandidates(options: TzCandidate[]): TzCandidate[] {
  return options.filter((o, i, a) => a.findIndex((x) => x.tz === o.tz) === i);
}

/** 指定日の正午時点での、その TZ の UTC オフセット（時間）。DST もそのまま反映される。 */
function tzOffsetHours(tz: string, onDate: string): number {
  const wall = `${onDate}T12:00:00`;
  return (Date.parse(`${wall}Z`) - wallClockToUtcMs(wall, tz)) / 3_600_000;
}

/** 経度差・時差は円環なので、差を [-12, 12] に畳んでから絶対値を取る（日付変更線対策）。 */
function circularHourGap(a: number, b: number): number {
  let d = a - b;
  while (d > 12) d -= 24;
  while (d < -12) d += 24;
  return Math.abs(d);
}

/**
 * 移動日の TZ 候補から、場所の経度に一番合うものを選ぶ。
 *
 * 移動日は同じ暦日に2つの TZ が並ぶので、壁時計だけでは «どちら側の 15:12 か»
 * を決められない（だからフォームが選ばせている）。だが場所が分かっていれば
 * 一意に決まる: 経度 ÷ 15 が太陽時のオフセットで、それに一番近い候補が
 * その場所の側。
 *
 *   Hana Koa Brewing  経度 -157.9 → -10.5h → Pacific/Honolulu(-10) を選ぶ
 *                                            （Asia/Tokyo(+9) ではない）
 *
 * TZ データベースも通信も要らず、候補が «飛行機で移動した2地点» である以上
 * 十分に離れているので、粗い推定で足りる。判定できない時は null を返し、
 * 呼び出し側が従来どおり先頭候補にフォールバックする。
 */
export function pickTzByLongitude(
  options: TzCandidate[],
  lng: number | null | undefined,
  onDate: string,
): TzCandidate | null {
  if (lng == null || !Number.isFinite(lng) || options.length === 0) return null;
  const solar = lng / 15;
  let best: TzCandidate | null = null;
  let bestGap = Infinity;
  for (const o of options) {
    const gap = circularHourGap(solar, tzOffsetHours(o.tz, onDate));
    if (gap < bestGap) {
      bestGap = gap;
      best = o;
    }
  }
  return best;
}

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
  // その日に触れた全候補を時系列順に集める（隣接重複=同じtzが続く場合は除く）。
  const touched: TzCandidate[] = [];
  const push = (tz: string, transitId: string, side: "depart" | "arrive") => {
    if (touched[touched.length - 1]?.tz !== tz) {
      touched.push({ tz, transitId, side });
    }
  };

  for (const t of transits) {
    if (cmpDate(date, t.departDate) < 0) {
      // これ以降の移動は date に関係ない
      break;
    }
    if (date === t.departDate && date === t.arriveDate) {
      // 出発・到着とも同一暦日の乗継。同日に続く別の乗継があるかもしれないので走査を続ける。
      push(t.departTz, t.transitId, "depart");
      push(t.arriveTz, t.transitId, "arrive");
      currentTz = t.arriveTz;
      continue;
    }
    if (date === t.departDate) {
      // 日をまたぐ移動の出発日。以降は機中でこの日のTZは確定しない
      // → 出発側のみ確定し、この日の走査を打ち切る（次の乗継は翌日以降にしかあり得ない）。
      push(t.departTz, t.transitId, "depart");
      break;
    }
    if (cmpDate(date, t.departDate) > 0 && cmpDate(date, t.arriveDate) < 0) {
      // 暦日まるごと空の上 → 到着側に寄せて確定
      push(t.arriveTz, t.transitId, "arrive");
      break;
    }
    if (date === t.arriveDate) {
      // 日をまたぐ移動の到着日。同日に続けて乗り継ぐかもしれないので走査を続ける。
      push(t.arriveTz, t.transitId, "arrive");
      currentTz = t.arriveTz;
      continue;
    }
    // この移動は date より前に完結している → 到着TZへ進んで次の移動を見る
    currentTz = t.arriveTz;
  }

  if (touched.length === 0) return { kind: "single", tz: currentTz };
  if (touched.length === 1) return { kind: "single", tz: touched[0].tz };
  return { kind: "ambiguous", options: touched };
}

/**
 * 移動日の候補を、その時刻では成立しないものを落として絞る。
 *
 * 移動日は候補が2つ出る（出発側＝出発地のTZ / 到着側＝到着地のTZ）。既定は
 * 先頭＝出発側なので、**到着後の支払いが出発地のTZになる**（日本→ホノルルの
 * 移動日に、到着後の朝食が日本時間になっていた。実機フィードバック）。
 *
 * 時刻で消せるものは消す:
 * - 出発側は「出発より前」でないと成立しない（出発後は機上か到着地にいる）
 * - 到着側は「到着より後」でないと成立しない
 *
 * 例: 成田 19:10 発 → ホノルル 07:25 着の日の 21:00 の夕食は、日本時間なら
 * 出発済みなので出発側が消え、到着側に決まる。一方 08:30 の朝食はどちらでも
 * 成立するので絞れない（そこは場所の経度で当てる＝pickTzByLongitude）。
 *
 * 絞れない（0個または2個以上残る）ときは元の候補をそのまま返す。
 */
export function narrowTzByTime(
  options: TzCandidate[],
  tl: TripTzTimeline,
  time: string | null | undefined,
): TzCandidate[] {
  if (!time || options.length < 2) return options;
  const kept = options.filter((o) => {
    const t = tl.transits.find((x) => x.transitId === o.transitId);
    if (!t) return true;
    return o.side === "depart" ? time <= t.departTime : time >= t.arriveTime;
  });
  return kept.length === 1 ? kept : options;
}

/**
 * 通常予定/費用の実際のTZを解決する。非曖昧な日は tzDisambig* を無視して
 * 自動導出、乗継当日は保存済みの選択（tzDisambigTransitId/side）で候補から
 * 引く。該当する乗継が旅程から消えている等で見つからなければ先頭候補
 * （出発側基準）にフォールバックする。
 */
export function resolveEventTz(
  date: string,
  tzDisambigTransitId: string | null,
  tzDisambigSide: "depart" | "arrive" | null,
  tl: TripTzTimeline,
): string {
  const r = resolveExpenseTz(date, tl);
  if (r.kind === "single") return r.tz;
  if (tzDisambigTransitId && tzDisambigSide) {
    const match = r.options.find(
      (o) => o.transitId === tzDisambigTransitId && o.side === tzDisambigSide,
    );
    if (match) return match.tz;
  }
  return r.options[0].tz;
}

/**
 * 予定の実効的な到着地。
 *
 * `endPlaceId` の NULL は「出発地と同じ」の意味で、DB に同じ値を二重には持たない
 * （通常予定でも東京→大阪のように出発地と到着地が違いうるので、「同じであること」を
 * CHECK 制約では守れない。事実を1箇所に置いて読む側で畳む方式にしている）。
 *
 * **この畳み込みを呼び出し側に散らかさないこと。** 散ると片方だけ直し忘れる事故が
 * 起き、二重管理と同じ問題に戻る。SQL 側も同じ理由で
 * `coalesce(end_place_id, start_place_id)` に統一する。
 */
export function eventEndPlaceId(
  e: Pick<ScheduleEvent, "startPlaceId" | "endPlaceId">,
): string | null {
  return e.endPlaceId ?? e.startPlaceId;
}
