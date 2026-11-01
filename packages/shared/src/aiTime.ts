import {
  narrowTzByTime,
  resolveExpenseTz,
  type TripTzTimeline,
  wallClockToUtcMs,
} from "./schedule";

// AI（MCP）と triplot の間の時刻の受け渡し。
//
// triplot は予定・費用の時刻を**現地の壁時計**で持ち、タイムゾーンは旅程
// （移動）から毎回決める（docs/design/timezone.md）。AI はこの決まりを知らない
// ので、壁時計だけをやり取りすると「日本時間のつもりで書いた」ずれが起きる。
//
// そこで AI とは **時差付きの時刻**（ISO 8601、例 `2027-08-11T12:00-10:00`）で
// やり取りする。現地の時刻と世界で1つの瞬間の両方が入っていて、AI も扱い慣れて
// いる。UTC にはしない（計画は現地の時計で考えるので、毎回の換算でかえって
// 間違える）。
//
// 書く時は、その日その時刻に旅行がいるタイムゾーンを旅程から求めて、AI の
// 時差と突き合わせる。食い違えば保存せず、AI が自分で直せる文を返す。

/** 時差付きの時刻。wall は "YYYY-MM-DDTHH:MM"（現地の壁時計）。 */
export type OffsetTime = { wall: string; offsetMinutes: number };

const OFFSET_TIME =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

/** `2027-08-11T12:00-10:00` / `…T12:00:00+09:00` / `…T03:00Z` を読む。時差の無いものは null。 */
export function parseOffsetTime(s: string): OffsetTime | null {
  const m = OFFSET_TIME.exec(s.trim());
  if (!m) return null;
  const [, date, hh, mm, off] = m;
  if (Number(hh) > 23 || Number(mm) > 59) return null;
  let offsetMinutes = 0;
  if (off !== "Z") {
    const sign = off[0] === "-" ? -1 : 1;
    const digits = off.slice(1).replace(":", "");
    offsetMinutes = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2)));
  }
  return { wall: `${date}T${hh}:${mm}`, offsetMinutes };
}

/** その壁時計の時刻での、タイムゾーンの UTC からの時差（分）。夏時間も反映。 */
export function tzOffsetMinutes(tz: string, wall: string): number {
  return Math.round((Date.parse(`${wall}:00Z`) - wallClockToUtcMs(wall, tz)) / 60_000);
}

/** 時差（分）を `+09:00` / `-10:00` にする。 */
export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const h = String(Math.floor(abs / 60)).padStart(2, "0");
  const m = String(abs % 60).padStart(2, "0");
  return `${sign}${h}:${m}`;
}

/** 現地の壁時計とタイムゾーンから、AI に見せる時差付きの時刻を作る。 */
export function withOffset(wall: string, tz: string): string {
  const w = wall.slice(0, 16);
  return `${w}${formatOffset(tzOffsetMinutes(tz, w))}`;
}

/** IANA のタイムゾーン名として使えるか。 */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** 時差付きの時刻が指す、世界で1つの瞬間（ms）。 */
export function instantOf(t: OffsetTime): number {
  return Date.parse(`${t.wall}:00Z`) - t.offsetMinutes * 60_000;
}

export type AiTimeResult =
  | {
      ok: true;
      /** 保存する壁時計 "YYYY-MM-DDTHH:MM:00" */
      wall: string;
      /** 決まったタイムゾーン。旅程に移動が無く決められない時は null */
      tz: string | null;
      /** 移動の日に、どの移動のどちら側か（予定・費用の tz_disambig_*） */
      disambig: { transitId: string; side: "depart" | "arrive" } | null;
    }
  | { ok: false; message: string };

/**
 * AI が送ってきた時差付きの時刻を、旅程と突き合わせて triplot の持ち方に直す。
 *
 * - 旅程に移動が無い: その旅行がどのタイムゾーンにいるかの根拠が無い（旅行の
 *   既定のタイムゾーンは作った端末の値＝推測）。壁時計をそのまま信じる。
 * - 移動の無い日: その日のタイムゾーンは1つ。時差が合わなければ断る。
 * - 移動の日（同じ日に2つのタイムゾーンが並ぶ）: 時差が合う側を選ぶ。どちらも
 *   合わなければ断る。
 *
 * `label` は断る文で、どの値の話かを AI に伝えるためのもの（"start" 等）。
 */
export function resolveAiTime(
  t: OffsetTime,
  timeline: TripTzTimeline,
  label: string,
): AiTimeResult {
  const wall = `${t.wall}:00`;
  if (timeline.transits.length === 0) {
    return { ok: true, wall, tz: null, disambig: null };
  }
  const date = t.wall.slice(0, 10);
  const time = t.wall.slice(11, 16);
  const r = resolveExpenseTz(date, timeline);
  if (r.kind === "single") {
    const expected = tzOffsetMinutes(r.tz, t.wall);
    if (expected === t.offsetMinutes) {
      return { ok: true, wall, tz: r.tz, disambig: null };
    }
    return {
      ok: false,
      message:
        `${label}: on ${date} the trip is in ${r.tz} (UTC${formatOffset(expected)}), ` +
        `but the time was sent as UTC${formatOffset(t.offsetMinutes)}. ` +
        `Times are local times at the place. If you meant ${time} local time, send ${t.wall}${formatOffset(expected)}.`,
    };
  }
  const matching = r.options.filter(
    (o) => tzOffsetMinutes(o.tz, t.wall) === t.offsetMinutes,
  );
  if (matching.length > 0) {
    const [pick] = narrowTzByTime(matching, timeline, time);
    return {
      ok: true,
      wall,
      tz: pick.tz,
      disambig: { transitId: pick.transitId, side: pick.side },
    };
  }
  const choices = r.options
    .map((o) => `${o.tz} (UTC${formatOffset(tzOffsetMinutes(o.tz, t.wall))})`)
    .filter((s, i, a) => a.indexOf(s) === i)
    .join(" or ");
  return {
    ok: false,
    message:
      `${label}: ${date} is a travel day; the trip is in ${choices} that day, ` +
      `but the time was sent as UTC${formatOffset(t.offsetMinutes)}. ` +
      `Send the local time with the offset of the side it happens on.`,
  };
}
