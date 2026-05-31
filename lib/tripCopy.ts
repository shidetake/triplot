// 過去の旅行をベースに新しい旅行を作るときの「日付の対応付け」ロジック（純関数）。
//
// 方針（ユーザ合意）: 旅程の日を「両端から」揃える。日数が変わるときは真ん中を
// 潰す（短くなる）or 空ける（長くなる）。旅程の中日はスキップしてよい予定が
// 入りがち、という前提。
//  - 残す日数 = min(元, 新)。前半 = ceil(keep/2)、後半 = floor(keep/2) に振り分け。
//  - 予定は壁時計の時刻はそのまま、日付だけ対応先へシフト。複数日にまたがる予定は
//    「開始日の対応」で動かし、期間（日数）を保つ。開始日が潰れた中日に当たる予定は
//    コピーしない（破棄）。
//
// 日付演算はすべて UTC ベース（ローカルTZ非依存）。lib/schedule と同方針。

// "YYYY-MM-DD" → UTC ミリ秒（その日の 00:00:00 UTC）。
function dateToUtc(date: string): number {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

const DAY_MS = 86_400_000;

// 2 つの "YYYY-MM-DD" の差（日数）。end が start より後なら正。
export function dayCountBetween(start: string, end: string): number {
  return Math.round((dateToUtc(end) - dateToUtc(start)) / DAY_MS);
}

// "YYYY-MM-DD" に n 日足した "YYYY-MM-DD"。
export function addDays(date: string, n: number): string {
  return new Date(dateToUtc(date) + n * DAY_MS).toISOString().slice(0, 10);
}

// 開始日・終了日（両端含む）から日数を出す。1 日旅行なら 1。
export function tripDayCount(startDate: string, endDate: string): number {
  return dayCountBetween(startDate, endDate) + 1;
}

// 元の各日 index(0..srcDays-1) → 新しい日 index、または null（潰して破棄）。
// 両端揃え・真ん中潰し。
export function mapTripDays(
  srcDays: number,
  newDays: number,
): (number | null)[] {
  if (srcDays <= 0) return [];
  if (newDays <= 0) return new Array(srcDays).fill(null);
  const keep = Math.min(srcDays, newDays);
  const front = Math.ceil(keep / 2);
  const back = keep - front;
  const res: (number | null)[] = [];
  for (let i = 0; i < srcDays; i++) {
    if (i < front) res.push(i);
    else if (i >= srcDays - back) res.push(newDays - (srcDays - i));
    else res.push(null);
  }
  return res;
}

export type CopyEventInput = {
  startAt: string; // "YYYY-MM-DDTHH:mm[:ss]" 壁時計
  endAt: string | null; // 壁時計 or null
};

export type CopyEventResult = {
  startAt: string;
  endAt: string | null;
} | null; // null = この予定はコピーしない（破棄）

// 1 件の予定の日付を新旅行へリマップ。時刻部はそのまま、日付だけシフトし、
// 期間（開始→終了の日数差）は保つ。開始日が範囲外 or 潰された中日なら null。
export function remapEventDate(
  ev: CopyEventInput,
  srcStartDate: string,
  newStartDate: string,
  srcToNew: (number | null)[],
): CopyEventResult {
  const startDate = ev.startAt.slice(0, 10);
  const srcDayIdx = dayCountBetween(srcStartDate, startDate);
  if (srcDayIdx < 0 || srcDayIdx >= srcToNew.length) return null;
  const newDayIdx = srcToNew[srcDayIdx];
  if (newDayIdx == null) return null;

  // 開始日に適用される日シフト量（同じ量を終了日にも適用して期間を保つ）。
  const newStart = addDays(newStartDate, newDayIdx);
  const shift = dayCountBetween(startDate, newStart);

  const shiftAt = (at: string): string => {
    const d = at.slice(0, 10);
    const timePart = at.slice(10); // "THH:mm[:ss]" or ""
    return addDays(d, shift) + timePart;
  };

  return {
    startAt: shiftAt(ev.startAt),
    endAt: ev.endAt != null ? shiftAt(ev.endAt) : null,
  };
}
