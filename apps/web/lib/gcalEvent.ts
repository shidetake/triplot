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
