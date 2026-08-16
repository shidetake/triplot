// 場所の絞り込み（エリア／日にち）。DB を触らない純粋関数。
// エリアは labelByPlace（地図のクラスタリングと同じ規則）のラベル、
// 日にちは visitDayByPlace の dayIndex で揃える。web・RN で共用する。

import type { VisitDay } from "./placeOrder";

export type PlaceFilter =
  // label は null＝ラベルの付かない「その他」。null も1つの選択肢として扱う
  // （「その他」だけを見たい、が成立する）。
  | { kind: "area"; label: string | null }
  | { kind: "day"; dayIndex: number };

export type AreaFilterOption = { label: string | null; count: number };
export type DayFilterOption = { dayIndex: number; date: string; count: number };

// エリアの選択肢。並び順は旅程順（そのエリアに最初に訪れる場所の絶対時刻が
// 早い順）。「成田→ハワイ」の旅程なら千葉県が先に来る（件数順だと訪問先の
// 多いエリアが先頭に来て旅程と噛み合わない、という実機フィードバック）。
// 旅程が分からない（日時未定）エリア同士は件数の多い順。
export function areaFilterOptions(
  areaByPlaceId: Map<string, string | null>,
  earliestMsByPlaceId: Map<string, number>,
): AreaFilterOption[] {
  const counts = new Map<string | null, number>();
  const earliestMs = new Map<string | null, number>();
  for (const [placeId, label] of areaByPlaceId) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
    const ms = earliestMsByPlaceId.get(placeId);
    if (ms != null) {
      const cur = earliestMs.get(label);
      if (cur == null || ms < cur) earliestMs.set(label, ms);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => {
      const ma = earliestMs.get(a[0]) ?? Infinity;
      const mb = earliestMs.get(b[0]) ?? Infinity;
      return ma !== mb ? ma - mb : b[1] - a[1];
    })
    .map(([label, count]) => ({ label, count }));
}

// 日にちの選択肢（旅程順）。予定・費用のどちらにも紐づかない場所は日付が
// 決まらないので、どの日にも属さない＝選択肢に出ない。
export function dayFilterOptions(
  dayByPlaceId: Map<string, VisitDay>,
): DayFilterOption[] {
  const byDay = new Map<number, DayFilterOption>();
  for (const day of dayByPlaceId.values()) {
    const cur = byDay.get(day.dayIndex);
    if (cur) cur.count += 1;
    else byDay.set(day.dayIndex, { dayIndex: day.dayIndex, date: day.date, count: 1 });
  }
  return [...byDay.values()].sort((a, b) => a.dayIndex - b.dayIndex);
}

export function matchesPlaceFilter(
  placeId: string,
  filter: PlaceFilter,
  areaByPlaceId: Map<string, string | null>,
  dayByPlaceId: Map<string, VisitDay>,
): boolean {
  return filter.kind === "area"
    ? areaByPlaceId.get(placeId) === filter.label
    : dayByPlaceId.get(placeId)?.dayIndex === filter.dayIndex;
}
