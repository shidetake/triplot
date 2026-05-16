import { describe, expect, it } from "vitest";

import {
  addDays,
  buildSchedule,
  formatDayLabel,
  parseWall,
  type ScheduleEvent,
} from "./schedule";

function ev(p: Partial<ScheduleEvent> & Pick<ScheduleEvent, "id">): ScheduleEvent {
  return {
    title: p.id,
    kind: "normal",
    allDay: false,
    startAt: "2026-05-01T09:00:00",
    endAt: null,
    startTz: "Asia/Tokyo",
    endTz: null,
    placeId: null,
    visibility: "shared",
    note: null,
    ...p,
  };
}

describe("壁時計・日付ユーティリティ", () => {
  it("parseWall は日付と分を取り出す（Date解釈しない）", () => {
    expect(parseWall("2026-05-01T19:10:00")).toEqual({
      date: "2026-05-01",
      minutes: 19 * 60 + 10,
    });
    expect(parseWall("2026-05-01")).toEqual({ date: "2026-05-01", minutes: 0 });
  });

  it("addDays は月跨ぎも正しい", () => {
    expect(addDays("2026-04-27", 5)).toBe("2026-05-02");
    expect(addDays("2026-05-01", -1)).toBe("2026-04-30");
  });

  it("formatDayLabel は M/D(曜)", () => {
    expect(formatDayLabel("2026-04-27")).toBe("4/27(月)");
  });
});

describe("buildSchedule: 列の構築", () => {
  it("イベントも trip 日付も無ければ空", () => {
    const s = buildSchedule([], {});
    expect(s.groups).toEqual([]);
    expect(s.columns).toEqual([]);
  });

  it("1泊2日は2列（無駄な7列を出さない）", () => {
    const s = buildSchedule([], {
      tripStart: "2026-04-27",
      tripEnd: "2026-04-28",
    });
    expect(s.columns.map((c) => c.date)).toEqual([
      "2026-04-27",
      "2026-04-28",
    ]);
  });

  it("8日旅行は8列", () => {
    const s = buildSchedule([], {
      tripStart: "2026-05-01",
      tripEnd: "2026-05-08",
    });
    expect(s.columns).toHaveLength(8);
  });

  it("イベントが trip 範囲外でも列が出る", () => {
    const s = buildSchedule(
      [ev({ id: "e1", startAt: "2026-05-10T09:00:00" })],
      { tripStart: "2026-05-01", tripEnd: "2026-05-02" },
    );
    expect(s.columns.map((c) => c.date)).toContain("2026-05-10");
  });

  it("時差移動が無い普通の日のTZは最初の非終日イベント由来", () => {
    const s = buildSchedule(
      [ev({ id: "e1", startTz: "Pacific/Honolulu" })],
      { tripStart: "2026-05-01", tripEnd: "2026-05-01" },
    );
    expect(s.columns[0].tz).toBe("Pacific/Honolulu");
  });
});

describe("buildSchedule: 時差移動の日は等幅2列", () => {
  const flight = ev({
    id: "f1",
    title: "NRT-HNL",
    kind: "transit",
    startAt: "2026-04-27T19:10:00",
    startTz: "Asia/Tokyo",
    endAt: "2026-04-27T08:30:00", // 日付変更線で同じ日付の朝に着く
    endTz: "Pacific/Honolulu",
  });

  it("移動日が出発TZ側/到着TZ側の2列グループになる", () => {
    const s = buildSchedule([flight], {
      tripStart: "2026-04-27",
      tripEnd: "2026-04-28",
    });
    const tgroup = s.groups.find((g) => g.key === "t-f1");
    expect(tgroup).toBeDefined();
    expect(tgroup!.columns).toHaveLength(2);
    expect(tgroup!.columns[0]).toMatchObject({
      role: "transit-depart",
      tz: "Asia/Tokyo",
      date: "2026-04-27",
    });
    expect(tgroup!.columns[1]).toMatchObject({
      role: "transit-arrive",
      tz: "Pacific/Honolulu",
      date: "2026-04-27",
    });
  });

  it("移動後はTZが到着側に切り替わる", () => {
    const s = buildSchedule([flight], {
      tripStart: "2026-04-27",
      tripEnd: "2026-04-29",
    });
    const after = s.columns.find(
      (c) => c.date === "2026-04-28" && c.role === "day",
    );
    expect(after?.tz).toBe("Pacific/Honolulu");
  });

  it("リボン用に出発列・到着列・分を持つ", () => {
    const s = buildSchedule([flight], {
      tripStart: "2026-04-27",
      tripEnd: "2026-04-28",
    });
    expect(s.transits).toHaveLength(1);
    expect(s.transits[0]).toMatchObject({
      departColumnKey: "t-f1-dep",
      departMin: 19 * 60 + 10,
      arriveColumnKey: "t-f1-arr",
      arriveMin: 8 * 60 + 30,
    });
  });

  it("復路で空中を跨いだ暦日は列を作らない（消えた日を正直に表現）", () => {
    const ret = ev({
      id: "r1",
      title: "HNL-NRT",
      kind: "transit",
      startAt: "2026-05-03T23:00:00",
      startTz: "Pacific/Honolulu",
      endAt: "2026-05-05T05:00:00", // 5/4 は空中で消える
      endTz: "Asia/Tokyo",
    });
    const s = buildSchedule([ret], {
      tripStart: "2026-05-01",
      tripEnd: "2026-05-05",
    });
    const dates = s.columns.map((c) => c.date);
    expect(dates).toContain("2026-05-03");
    expect(dates).toContain("2026-05-05");
    expect(dates).not.toContain("2026-05-04");
  });
});

describe("buildSchedule: 時刻イベントの重なりレーン", () => {
  it("重ならなければ1レーン", () => {
    const s = buildSchedule(
      [
        ev({ id: "a", startAt: "2026-05-01T09:00:00", endAt: "2026-05-01T10:00:00" }),
        ev({ id: "b", startAt: "2026-05-01T11:00:00", endAt: "2026-05-01T12:00:00" }),
      ],
      { tripStart: "2026-05-01", tripEnd: "2026-05-01" },
    );
    expect(s.timed.every((t) => t.laneCount === 1)).toBe(true);
  });

  it("重なると横並びレーンに分かれる", () => {
    const s = buildSchedule(
      [
        ev({ id: "a", startAt: "2026-05-01T09:00:00", endAt: "2026-05-01T11:00:00" }),
        ev({ id: "b", startAt: "2026-05-01T10:00:00", endAt: "2026-05-01T12:00:00" }),
      ],
      { tripStart: "2026-05-01", tripEnd: "2026-05-01" },
    );
    const a = s.timed.find((t) => t.event.id === "a")!;
    const b = s.timed.find((t) => t.event.id === "b")!;
    expect(a.laneCount).toBe(2);
    expect(b.laneCount).toBe(2);
    expect(new Set([a.lane, b.lane])).toEqual(new Set([0, 1]));
  });

  it("end 無しは既定60分扱い", () => {
    const s = buildSchedule(
      [ev({ id: "a", startAt: "2026-05-01T09:00:00", endAt: null })],
      { tripStart: "2026-05-01", tripEnd: "2026-05-01" },
    );
    expect(s.timed[0].endMin).toBe(10 * 60);
  });
});

describe("buildSchedule: 終日・連日バー", () => {
  it("連日バーが正しい列index範囲を持ち、重なりは別行へ", () => {
    const s = buildSchedule(
      [
        ev({
          id: "stay",
          title: "宿泊",
          allDay: true,
          startTz: "UTC",
          startAt: "2026-05-02T00:00:00",
          endAt: "2026-05-04T00:00:00",
        }),
        ev({
          id: "x",
          title: "イベント",
          allDay: true,
          startTz: "UTC",
          startAt: "2026-05-03T00:00:00",
          endAt: "2026-05-03T00:00:00",
        }),
      ],
      { tripStart: "2026-05-01", tripEnd: "2026-05-05" },
    );
    // columns: 05-01..05-05 = index 0..4
    const stay = s.allDayBars.find((b) => b.event.id === "stay")!;
    expect(stay.startColIndex).toBe(1);
    expect(stay.endColIndex).toBe(3);
    expect(stay.row).toBe(0);
    const x = s.allDayBars.find((b) => b.event.id === "x")!;
    expect(x.row).toBe(1); // 宿泊と重なるので別行
    expect(s.allDayRowCount).toBe(2);
  });
});

describe("buildSchedule: 縦軸は常に0:00-24:00固定", () => {
  it("予定があっても窓は伸縮しない", () => {
    const s = buildSchedule(
      [
        ev({ id: "a", startAt: "2026-05-01T09:00:00", endAt: "2026-05-01T10:00:00" }),
        ev({ id: "b", startAt: "2026-05-01T14:00:00", endAt: "2026-05-01T15:30:00" }),
      ],
      { tripStart: "2026-05-01", tripEnd: "2026-05-01" },
    );
    expect(s.window).toEqual({ startMin: 0, endMin: 24 * 60 });
  });

  it("予定が無くても 0:00-24:00", () => {
    const s = buildSchedule([], {
      tripStart: "2026-05-01",
      tripEnd: "2026-05-01",
    });
    expect(s.window).toEqual({ startMin: 0, endMin: 24 * 60 });
  });
});
