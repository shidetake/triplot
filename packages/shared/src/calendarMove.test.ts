import { describe, expect, it } from "vitest";

import {
  canMoveEvent,
  grabOffsetMinutes,
  movedEventTiming,
  movedTzDisambig,
} from "./calendarMove";

const base = { kind: "normal" as const, allDay: false, startAt: "", endAt: null };

describe("canMoveEvent", () => {
  it("時間のある通常の予定は動かせる", () => {
    expect(canMoveEvent(base)).toBe(true);
  });

  it("移動（フライト等）は動かせない", () => {
    expect(canMoveEvent({ ...base, kind: "transit" })).toBe(false);
  });

  it("終日は動かせない", () => {
    expect(canMoveEvent({ ...base, allDay: true })).toBe(false);
  });

  it("取り込みの下書きは動かせない", () => {
    expect(canMoveEvent({ ...base, isDraft: true })).toBe(false);
  });
});

describe("movedEventTiming", () => {
  const ev = { startAt: "2026-09-09T14:00", endAt: "2026-09-09T15:30" };
  // 14:20 を掴む＝開始から 20 分下。
  const grab = grabOffsetMinutes(ev.startAt, 14 * 60 + 20);

  it("掴んだ点が指に付いてくる（上端に吸い付かない）", () => {
    expect(grab).toBe(20);
    // 指を翌日 17:20 に置いたら、開始は 17:00。
    expect(
      movedEventTiming(ev, {
        date: "2026-09-10",
        dropMinutes: 17 * 60 + 20,
        grabOffset: grab,
      }),
    ).toEqual({ startAt: "2026-09-10T17:00", endAt: "2026-09-10T18:30" });
  });

  it("長さは変わらない", () => {
    const r = movedEventTiming(
      { startAt: "2026-09-09T09:00", endAt: "2026-09-09T09:45" },
      { date: "2026-09-09", dropMinutes: 20 * 60, grabOffset: 0 },
    );
    expect(r).toEqual({ startAt: "2026-09-09T20:00", endAt: "2026-09-09T20:45" });
  });

  it("開始は30分にスナップする", () => {
    expect(
      movedEventTiming(ev, {
        date: "2026-09-09",
        dropMinutes: 10 * 60 + 12,
        grabOffset: 0,
      })?.startAt,
    ).toBe("2026-09-09T10:00");
    expect(
      movedEventTiming(ev, {
        date: "2026-09-09",
        dropMinutes: 10 * 60 + 20,
        grabOffset: 0,
      })?.startAt,
    ).toBe("2026-09-09T10:30");
  });

  it("動いていなければ null（保存しない）", () => {
    expect(
      movedEventTiming(ev, {
        date: "2026-09-09",
        dropMinutes: 14 * 60 + 20,
        grabOffset: grab,
      }),
    ).toBeNull();
  });

  // 深夜0時ちょうどの終わりは翌日の 00:00 として書く（壁時計に 24:00 は無い）。
  it("その日からはみ出さない（下端）", () => {
    expect(
      movedEventTiming(ev, {
        date: "2026-09-09",
        dropMinutes: 23 * 60 + 50,
        grabOffset: 0,
      }),
    ).toEqual({ startAt: "2026-09-09T22:30", endAt: "2026-09-10T00:00" });
  });

  it("その日からはみ出さない（上端）", () => {
    expect(
      movedEventTiming(ev, { date: "2026-09-09", dropMinutes: 10, grabOffset: 60 }),
    ).toEqual({ startAt: "2026-09-09T00:00", endAt: "2026-09-09T01:30" });
  });

  it("終了時刻の無い予定は開始だけ動く", () => {
    expect(
      movedEventTiming(
        { startAt: "2026-09-09T14:00", endAt: null },
        { date: "2026-09-11", dropMinutes: 8 * 60, grabOffset: 0 },
      ),
    ).toEqual({ startAt: "2026-09-11T08:00", endAt: null });
  });

  it("日を跨ぐ長さの予定は、跨いだまま動く", () => {
    expect(
      movedEventTiming(
        { startAt: "2026-09-09T22:00", endAt: "2026-09-10T02:00" },
        { date: "2026-09-11", dropMinutes: 23 * 60, grabOffset: 0 },
      ),
    ).toEqual({ startAt: "2026-09-11T23:00", endAt: "2026-09-12T03:00" });
  });
});

describe("movedTzDisambig", () => {
  const ev = {
    startAt: "2026-09-09T14:00",
    tzDisambigTransitId: "tr1",
    tzDisambigSide: "arrive" as const,
  };

  it("同じ日の中で動かすなら選択は残す", () => {
    expect(movedTzDisambig(ev, { startAt: "2026-09-09T18:00" })).toEqual({
      transitId: "tr1",
      side: "arrive",
    });
  });

  // 別の日の乗継を指したまま残すと、名前だけ残った参照になる。
  it("日が変わったら選択を捨てる", () => {
    expect(movedTzDisambig(ev, { startAt: "2026-09-10T14:00" })).toEqual({
      transitId: null,
      side: null,
    });
  });
});
