// 週カレンダーの確定済み予定を、長押し＋ドラッグで動かす時の日時の計算
// （純関数。web と RN が同じ規則で動くようにここに1本だけ置く）。
//
// 動かせるのは**時間のある通常の予定だけ**にしてある。理由は種別ごとに違う:
//   - 移動（kind='transit'）: 便の時刻は予約された事実で、指で動かすものでは
//     ない。旅行のタイムゾーン境界の唯一の真実源でもあるので、ここが動くと
//     他の予定の実効タイムゾーンまで連れて動く。
//   - 終日: 縦の位置が時刻を意味しないので、同じ「掴んで置く」操作にならない
//     （日付だけ動かす別の操作になる）。
//   - 下書き（取り込みの未確定）: 動かす前に確定させる方が筋。
//
// 長さは変えない。掴んだ予定の所要時間をそのまま持っていく（Google カレンダー
// と同じ。長さを変えるのは端のハンドルを掴む別の操作）。

import { addDays, parseWall } from "./schedule";

export type MovableEvent = {
  kind: "normal" | "transit";
  allDay: boolean;
  startAt: string;
  endAt: string | null;
  isDraft?: boolean;
};

export function canMoveEvent(e: MovableEvent): boolean {
  return e.kind === "normal" && !e.allDay && !e.isDraft;
}

// 掴んだ位置の分単位のずれ。ブロックの上端ではなく**掴んだ点**を指に追従させる
// ため、開始からの差を持っておく（上端に吸い付くと、下の方を掴んだ時に予定が
// 指より上へ飛ぶ）。
export function grabOffsetMinutes(startAt: string, grabMinutes: number): number {
  return grabMinutes - parseWall(startAt).minutes;
}

const SNAP_MIN = 30;
const DAY_MIN = 24 * 60;

export type MovedTiming = { startAt: string; endAt: string | null };

/**
 * 掴んだ予定を、置いた列（date）と置いた時刻（dropMinutes＝指の位置の通算分）
 * へ動かした結果の壁時計を返す。動かす必要が無ければ null（＝保存しない）。
 *
 * `grabOffset` は掴んだ点の開始からのずれ（grabOffsetMinutes）。
 * 開始時刻は 30 分にスナップする（空き枠の長押しで作る時と同じ刻み）。
 */
export function movedEventTiming(
  e: { startAt: string; endAt: string | null },
  target: { date: string; dropMinutes: number; grabOffset: number },
): MovedTiming | null {
  const start = parseWall(e.startAt);
  const end = e.endAt ? parseWall(e.endAt) : null;
  // 終了が翌日以降に跨っていても、長さは「絶対の分」で測る。
  const durationMin = end
    ? daysBetween(start.date, end.date) * DAY_MIN + end.minutes - start.minutes
    : 0;

  const rawStart = target.dropMinutes - target.grabOffset;
  const snapped = Math.round(rawStart / SNAP_MIN) * SNAP_MIN;
  // **日跨ぎを新しく作らない。跨いでいたものは跨いだまま。**
  // 日を跨いでいなかった予定は、置いた日の中に丸ごと収める（下端に置いても
  // 翌日に尻尾が出ない）。元から深夜を跨いでいた予定は収まりようが無いので、
  // 開始だけ置いた日の中に留める。
  const crossed = end != null && end.date !== start.date;
  const latestStart = crossed ? DAY_MIN - SNAP_MIN : DAY_MIN - durationMin;
  const startMin = Math.max(0, Math.min(latestStart, snapped));

  const startAt = wall(target.date, startMin);
  if (startAt === e.startAt) return null;
  return {
    startAt,
    endAt: e.endAt ? wall(target.date, startMin + durationMin) : null,
  };
}

// 乗継当日の選択（どの乗継の出発側/到着側か）は**日付に紐づく**ので、日が
// 変われば捨てる。別の日の乗継を指したまま残すと、名前だけ残った参照になる
// （resolveEventTz は一致しなければ先頭候補に落ちるので表示は壊れないが、
// 直った気配も無く違う側を指し続ける）。
//
// 元に戻す時はこれを通さず、動かす前の値をそのまま書き戻す（「戻す」は
// 移動ではなく、あの時の状態に復元することなので）。
export type TzDisambig = {
  transitId: string | null;
  side: "depart" | "arrive" | null;
};

export function movedTzDisambig(
  from: {
    startAt: string;
    tzDisambigTransitId: string | null;
    tzDisambigSide: "depart" | "arrive" | null;
  },
  to: { startAt: string },
): TzDisambig {
  return from.startAt.slice(0, 10) === to.startAt.slice(0, 10)
    ? { transitId: from.tzDisambigTransitId, side: from.tzDisambigSide }
    : { transitId: null, side: null };
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );
}

/** "YYYY-MM-DD" ＋ 通算分 → 壁時計。分が24時を超えたら日付に繰り上げる。 */
function wall(date: string, minutes: number): string {
  const day = Math.floor(minutes / DAY_MIN);
  const m = minutes - day * DAY_MIN;
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${addDays(date, day)}T${hh}:${mm}`;
}
