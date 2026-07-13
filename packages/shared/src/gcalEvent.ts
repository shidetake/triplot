import {
  resolveEventTz,
  type ScheduleEvent,
  type TripTzTimeline,
} from "./schedule";

// triplot の予定 → Google Calendar API の event リソースへの変換（純粋関数）。
// triplot は壁時計（timezone なしの timestamp）＋ IANA TZ を別々に持つので、
// Google には dateTime（オフセット無しの壁時計）＋ timeZone を渡す。終日は
// date（YYYY-MM-DD）で、Google の終日 end は排他なので +1 日する。
// transit も「開始 TZ と終了 TZ が違う timed 予定」として同じ経路で扱える。

export type GcalEventInput = {
  title: string;
  allDay: boolean;
  startAt: string; // 壁時計 "YYYY-MM-DDTHH:mm:ss"（空白区切りも許容）
  endAt: string | null;
  startTz: string; // IANA, 例 "Asia/Tokyo"
  endTz: string;
  location?: string | null;
  description?: string | null;
};

export type GcalDate =
  | { dateTime: string; timeZone: string }
  | { date: string };

export type GcalEvent = {
  summary: string;
  location?: string;
  description?: string;
  start: GcalDate;
  end: GcalDate;
};

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// 壁時計文字列を RFC3339（オフセット無し・秒あり）に正規化。
// 末尾の小数秒やオフセット/Z は落とす（timeZone フィールドで解釈させる）。
function normalizeWallClock(s: string): string {
  let t = s.trim().replace(" ", "T");
  t = t.replace(/(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/, "");
  if (/T\d{2}:\d{2}$/.test(t)) t += ":00";
  return t;
}

// エクスポート対象の予定。mine = 自分が参加する予定か（全員予定 or 自分が当事者）。
// 出力範囲（自分のみ/全て）の絞り込みに使う。
export type CalendarExportEvent = GcalEventInput & { mine: boolean };

// スケジュールの予定 → エクスポート対象への変換（web の trip ページと RN の
// エクスポート画面で共用）。場所は「名前 + 住所」を location に、TZ は
// transit 以外は旅程から都度解決する（乗継編集にも自動追従）。
export function buildCalendarExportEvents(
  scheduleEvents: ScheduleEvent[],
  opts: {
    myMemberId: string;
    places: { id: string; name: string; formatted_address: string | null }[];
    tzTimeline: TripTzTimeline;
  },
): CalendarExportEvent[] {
  const placeNameById = new Map(opts.places.map((p) => [p.id, p.name]));
  const placeAddressById = new Map(
    opts.places.map((p) => [p.id, p.formatted_address]),
  );
  return scheduleEvents.map((e) => {
    const placeName = e.placeId ? (placeNameById.get(e.placeId) ?? "") : "";
    const placeAddr = e.placeId
      ? (placeAddressById.get(e.placeId) ?? null)
      : null;
    const location = [placeName, placeAddr].filter(Boolean).join(" ") || null;
    // 参加者空配列 = 全員参加のシュガー。自分が当事者か全員予定なら mine。
    const mine =
      e.participantMemberIds.length === 0 ||
      e.participantMemberIds.includes(opts.myMemberId);
    // transit は実TZを直接使う。normal/allday は startTz を持たないことが
    // あるので旅程から都度解決する。
    const startTz =
      e.kind === "transit"
        ? (e.startTz as string)
        : resolveEventTz(
            e.startAt.slice(0, 10),
            e.tzDisambigTransitId,
            e.tzDisambigSide,
            opts.tzTimeline,
          );
    const endTz = e.kind === "transit" ? (e.endTz as string) : startTz;
    return {
      title: e.title,
      allDay: e.allDay,
      startAt: e.startAt,
      endAt: e.endAt,
      startTz,
      endTz,
      location,
      description: e.note,
      mine,
    };
  });
}

export function toGcalEvent(e: GcalEventInput): GcalEvent {
  let start: GcalDate;
  let end: GcalDate;
  if (e.allDay) {
    const startDate = e.startAt.slice(0, 10);
    const endSource = (e.endAt ?? e.startAt).slice(0, 10);
    // Google の終日 end は排他（最終日の翌日を指す）。
    start = { date: startDate };
    end = { date: addDays(endSource, 1) };
  } else {
    start = { dateTime: normalizeWallClock(e.startAt), timeZone: e.startTz };
    end = {
      dateTime: normalizeWallClock(e.endAt ?? e.startAt),
      timeZone: e.endTz,
    };
  }

  const ev: GcalEvent = { summary: e.title, start, end };
  const loc = e.location?.trim();
  if (loc) ev.location = loc;
  const desc = e.description?.trim();
  if (desc) ev.description = desc;
  return ev;
}
