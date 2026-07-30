// 場所一覧の並び順。DB を触らない純粋関数。
//
// 一覧は「上から順に旅行で訪れる順番」に見せる。訪問時刻は場所自身が持って
// いないので、その場所に紐づくものから引く。出どころは2つあり、**どちらでも
// 早い方**を代表にする:
//   - 予定（events.place_id）… start_at
//   - 費用（expenses.place_id）… paid_at（その場で払った＝そこに居た証拠）
// 同じ場所に複数紐づく（1回の旅行で複数回行く）ときも一番早いものを採る。
//
// 群の順序（上→下）:
//   1. 確定 × 地図未登録（ピン未設定）… 地図に出せず「ピンを設定」が要る
//   2. 確定 × 日時あり             … 訪問順（最も早い予定/費用の絶対時刻）
//   3. 確定 × 日時なし             … いつ行くか不明なので確定群の最下部
//   4. 候補（tentative）           … 常にその下
//
// 「地図未登録」と「候補」は指示上どちらも極に置く指定だが、両方に当たる場所
// （ピン未設定の候補）は**候補を優先して下**に置く。候補は関与度が低く、
// 一覧の先頭を占めるべきではないため。候補群の内部でも地図未登録が先頭に来る。

import {
  eventEndPlaceId,
  resolveEventTz,
  wallClockToUtcMs,
  type ScheduleEvent,
  type TripTzTimeline,
} from "./schedule";

// 並び替えに要る最小の形だけを要求する（PlaceRow / ScheduleEvent / ExpenseRow
// の部分集合）。呼び出し側の行の型はそのまま返したいのでジェネリックにする。
export type OrderablePlace = {
  id: string;
  lat: number | null;
  lng: number | null;
  tentative: boolean;
  created_at: string;
};

export type OrderableEvent = Pick<
  ScheduleEvent,
  | "kind"
  | "startAt"
  | "endAt"
  | "endTz"
  | "startTz"
  | "tzDisambigTransitId"
  | "tzDisambigSide"
  | "startPlaceId"
  | "endPlaceId"
>;

// ExpenseRow の部分集合。tz は deriveOrderedExpenses が解決済みで持っている
// ので、ここで旅程から引き直さずそれを使う（同じ値を2箇所で導出しない）。
export type OrderableExpense = {
  place_id: string | null;
  paid_at: string;
  tz: string;
};

/**
 * 場所ごとの「最初に訪れる絶対時刻(ms)」。予定にも費用にも紐づかない場所は
 * 含まない（＝日時不明）。
 *
 * 壁時計のまま比べると TZ を跨いだとき順序が狂う（費用の発生順が絶対時刻な
 * のと同じ理由）ので、TZ を解決してから UTC ミリ秒にして比べる。
 */
export function earliestVisitByPlace(
  events: OrderableEvent[],
  expenses: OrderableExpense[],
  tzTimeline: TripTzTimeline,
): Map<string, number> {
  const earliest = new Map<string, number>();
  const keepEarliest = (placeId: string, ms: number) => {
    const current = earliest.get(placeId);
    if (current === undefined || ms < current) earliest.set(placeId, ms);
  };

  for (const e of events) {
    const startPlaceId = e.startPlaceId;
    const endPlaceId = eventEndPlaceId(e);
    if (!startPlaceId && !endPlaceId) continue;
    // transit は startTz が唯一の真実源。normal/allday は startTz を持たない
    // ことがあるので旅程から都度解決する（gcalEvent.ts と同じ作法）。
    const tz =
      e.kind === "transit"
        ? (e.startTz as string)
        : resolveEventTz(
            e.startAt.slice(0, 10),
            e.tzDisambigTransitId,
            e.tzDisambigSide,
            tzTimeline,
          );
    // 出発地には出発時刻、到着地には到着時刻を当てる（移動の到着空港が
    // 出発時刻で並ぶとおかしいため）。到着時刻が無ければ出発時刻で代用。
    if (startPlaceId) {
      keepEarliest(startPlaceId, wallClockToUtcMs(e.startAt, tz));
    }
    if (endPlaceId && endPlaceId !== startPlaceId) {
      const arriveTz = e.kind === "transit" ? (e.endTz as string) : tz;
      keepEarliest(
        endPlaceId,
        wallClockToUtcMs(e.endAt ?? e.startAt, arriveTz),
      );
    }
  }

  for (const x of expenses) {
    if (!x.place_id) continue;
    keepEarliest(x.place_id, wallClockToUtcMs(x.paid_at, x.tz));
  }

  return earliest;
}

// 群の番号（小さいほど上）。上のコメントの 1〜4 に対応（候補は地図未登録かで
// 内部を分けるので 4/5 の2段）。
function groupRank(p: OrderablePlace, dated: boolean): number {
  const unpinned = p.lat == null || p.lng == null;
  if (p.tentative) return unpinned ? 4 : 5;
  if (unpinned) return 1;
  return dated ? 2 : 3;
}

/**
 * 場所一覧を訪問順に並べる。入力は破壊しない。
 *
 * 同順位（日時なしの群・候補群・同時刻）は **created_at の新しい順**で安定
 * させる＝並び替え導入前の既定順をそのまま踏襲する。
 */
export function sortPlacesByItinerary<T extends OrderablePlace>(
  places: T[],
  events: OrderableEvent[],
  expenses: OrderableExpense[],
  tzTimeline: TripTzTimeline,
): T[] {
  const earliest = earliestVisitByPlace(events, expenses, tzTimeline);
  return [...places].sort((a, b) => {
    const va = earliest.get(a.id);
    const vb = earliest.get(b.id);
    const ga = groupRank(a, va !== undefined);
    const gb = groupRank(b, vb !== undefined);
    if (ga !== gb) return ga - gb;
    if (va !== undefined && vb !== undefined && va !== vb) return va - vb;
    // 新しいものが上（従来の created_at DESC）。
    return a.created_at < b.created_at
      ? 1
      : a.created_at > b.created_at
        ? -1
        : 0;
  });
}
