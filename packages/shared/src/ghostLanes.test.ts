import { describe, expect, it } from "vitest";

import { computeGhostLaneOverrides, GHOST_LANE_KEY } from "./ghostLanes";
import type { PlacedEvent, PlacedTransit } from "./schedule";

const ev = (
  id: string,
  columnKey: string,
  topMin: number,
  endMin: number,
): PlacedEvent =>
  ({
    event: { id } as PlacedEvent["event"],
    columnKey,
    topMin,
    endMin,
    lane: 0,
    laneCount: 1,
  }) as PlacedEvent;

describe("computeGhostLaneOverrides", () => {
  it("ゴーストが null なら null", () => {
    expect(computeGhostLaneOverrides(null, [], [])).toBeNull();
  });

  it("重なりが無ければ override は空（既存は従来レーン・ゴーストは全幅）", () => {
    const r = computeGhostLaneOverrides(
      { columnKey: "d1", topMin: 600, endMin: 660 },
      [ev("a", "d1", 700, 760)],
      [],
    );
    expect(r!.size).toBe(0);
  });

  it("重なる既存予定とレーンを分け合う", () => {
    const r = computeGhostLaneOverrides(
      { columnKey: "d1", topMin: 600, endMin: 660 },
      [ev("a", "d1", 570, 630)],
      [],
    )!;
    expect(r.get("a")).toEqual({ lane: 0, laneCount: 2 });
    expect(r.get(GHOST_LANE_KEY)).toEqual({ lane: 1, laneCount: 2 });
  });

  it("別列の予定は無関係", () => {
    const r = computeGhostLaneOverrides(
      { columnKey: "d1", topMin: 600, endMin: 660 },
      [ev("a", "d2", 600, 660)],
      [],
    )!;
    expect(r.size).toBe(0);
  });

  it("3つ巴の重なりは laneCount=3", () => {
    const r = computeGhostLaneOverrides(
      { columnKey: "d1", topMin: 600, endMin: 720 },
      [ev("a", "d1", 590, 700), ev("b", "d1", 610, 710)],
      [],
    )!;
    expect(r.get("a")!.laneCount).toBe(3);
    expect(r.get("b")!.laneCount).toBe(3);
    expect(r.get(GHOST_LANE_KEY)!.laneCount).toBe(3);
    // レーンは重複しない
    const lanes = ["a", "b", GHOST_LANE_KEY].map((k) => r.get(k)!.lane);
    expect(new Set(lanes).size).toBe(3);
  });

  it("時差移動の出発側（ゴーストの列）とも重なりを取り合う", () => {
    const transit = {
      event: { id: "t1" },
      departColumnKey: "d1",
      departMin: 600,
      departLane: 0,
      departLaneCount: 1,
      arriveColumnKey: "d2",
      arriveMin: 300,
      arriveLane: 0,
      arriveLaneCount: 1,
    } as PlacedTransit;
    const r = computeGhostLaneOverrides(
      { columnKey: "d1", topMin: 620, endMin: 680 },
      [],
      [transit],
    )!;
    // 出発側は 600→24:00 扱いなのでゴーストと重なる。
    expect(r.get("t1")!.laneCount).toBe(2);
    expect(r.get(GHOST_LANE_KEY)!.laneCount).toBe(2);
  });
});
