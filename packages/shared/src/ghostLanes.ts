// 週カレンダーの「追加中ゴースト」のレーン合流計算（純粋関数）。
// ゴースト（長押し/ドラッグで置く仮ブロック）が既存予定と時間帯で重なるとき、
// ゴーストを含めてその列のレーンを引き直す。既存予定同士は schedule.ts の
// cluster + greedy lane と同じアルゴリズム、**ゴーストは常に右端の専用レーン**
// （開始時刻の前後で左右が入れ替わるとドラッグ中に落ち着かないため固定）。
// 重ならないクラスタ・ゴースト不在クラスタは含めない＝既存ブロックは従来の
// レーン、ゴーストは全幅で描かれる。web / RN 共用。

import {
  MIN_EVENT_MIN,
  type PlacedEvent,
  type PlacedTransit,
} from "./schedule";

// override map でゴースト自身を引くためのキー（イベント id と衝突しない値）。
export const GHOST_LANE_KEY = "__ghost__";

export type LaneOverride = { lane: number; laneCount: number };

export type GhostTarget = {
  columnKey: string;
  topMin: number;
  endMin: number;
};

export function computeGhostLaneOverrides(
  ghost: GhostTarget | null,
  timed: PlacedEvent[],
  transits: PlacedTransit[],
): Map<string, LaneOverride> | null {
  if (!ghost) return null;
  const ghostColKey = ghost.columnKey;

  type Entry = { topMin: number; endMin: number; id: string };
  const entries: Entry[] = [
    ...timed
      .filter((p) => p.columnKey === ghostColKey)
      .map((p) => ({ topMin: p.topMin, endMin: p.endMin, id: p.event.id })),
    // 時差移動もゴーストと同じ土俵で重なりを取り合う（通常予定と同様）。
    // 出発側・到着側は別列のことがあるので、ゴーストの列に居る側だけ拾う。
    ...transits.flatMap((t) => {
      if (t.departColumnKey === t.arriveColumnKey) {
        return t.departColumnKey === ghostColKey
          ? [{ topMin: t.departMin, endMin: t.arriveMin, id: t.event.id }]
          : [];
      }
      if (t.departColumnKey === ghostColKey) {
        return [{ topMin: t.departMin, endMin: 24 * 60, id: t.event.id }];
      }
      if (t.arriveColumnKey === ghostColKey) {
        return [{ topMin: 0, endMin: t.arriveMin, id: t.event.id }];
      }
      return [];
    }),
    { topMin: ghost.topMin, endMin: ghost.endMin, id: GHOST_LANE_KEY },
  ];
  entries.sort((a, b) => a.topMin - b.topMin || a.endMin - b.endMin);

  const result = new Map<string, LaneOverride>();
  let cluster: Entry[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const hasGhost = cluster.some((c) => c.id === GHOST_LANE_KEY);
    const others = cluster.filter((c) => c.id !== GHOST_LANE_KEY);
    // ゴーストが他予定と重なる時だけ override。既存予定は greedy に詰め、
    // ゴーストはその右に専用レーンを1本足す（常に右端）。
    if (hasGhost && others.length > 0) {
      const laneEnds: number[] = [];
      const assigned: { e: Entry; lane: number }[] = [];
      for (const e of others) {
        const dispEnd = Math.max(e.endMin, e.topMin + MIN_EVENT_MIN);
        let lane = laneEnds.findIndex((ee) => ee <= e.topMin);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(dispEnd);
        } else {
          laneEnds[lane] = dispEnd;
        }
        assigned.push({ e, lane });
      }
      const laneCount = laneEnds.length + 1;
      for (const { e, lane } of assigned) {
        result.set(e.id, { lane, laneCount });
      }
      result.set(GHOST_LANE_KEY, { lane: laneCount - 1, laneCount });
    }
    cluster = [];
    clusterEnd = -1;
  };
  for (const e of entries) {
    const dispEnd = Math.max(e.endMin, e.topMin + MIN_EVENT_MIN);
    if (cluster.length === 0 || e.topMin < clusterEnd) {
      cluster.push(e);
      clusterEnd = Math.max(clusterEnd, dispEnd);
    } else {
      flush();
      cluster.push(e);
      clusterEnd = dispEnd;
    }
  }
  if (cluster.length) flush();
  return result;
}
