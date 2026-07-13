import { describe, it, expect } from "vitest";

import { toGcalEvent, type GcalEventInput } from "./gcalEvent";

const base = (over: Partial<GcalEventInput> = {}): GcalEventInput => ({
  title: "観光",
  allDay: false,
  startAt: "2026-05-01T09:00:00",
  endAt: "2026-05-01T10:30:00",
  startTz: "Asia/Tokyo",
  endTz: "Asia/Tokyo",
  ...over,
});

describe("toGcalEvent", () => {
  it("timed 予定は dateTime + timeZone を出す", () => {
    const ev = toGcalEvent(base());
    expect(ev.summary).toBe("観光");
    expect(ev.start).toEqual({
      dateTime: "2026-05-01T09:00:00",
      timeZone: "Asia/Tokyo",
    });
    expect(ev.end).toEqual({
      dateTime: "2026-05-01T10:30:00",
      timeZone: "Asia/Tokyo",
    });
  });

  it("終日予定は date で、end は排他（最終日+1）", () => {
    const ev = toGcalEvent(
      base({ allDay: true, startAt: "2026-05-01", endAt: "2026-05-03" }),
    );
    expect(ev.start).toEqual({ date: "2026-05-01" });
    expect(ev.end).toEqual({ date: "2026-05-04" });
  });

  it("終日・単日（endAt なし）は翌日が end", () => {
    const ev = toGcalEvent(
      base({ allDay: true, startAt: "2026-05-01", endAt: null }),
    );
    expect(ev.start).toEqual({ date: "2026-05-01" });
    expect(ev.end).toEqual({ date: "2026-05-02" });
  });

  it("月またぎの終日 end も正しく +1 する", () => {
    const ev = toGcalEvent(
      base({ allDay: true, startAt: "2026-05-31", endAt: "2026-05-31" }),
    );
    expect(ev.end).toEqual({ date: "2026-06-01" });
  });

  it("transit は開始 TZ と終了 TZ が違う timed 予定", () => {
    const ev = toGcalEvent(
      base({
        title: "NRT→SFO",
        startAt: "2026-05-01T17:00:00",
        endAt: "2026-05-01T10:00:00",
        startTz: "Asia/Tokyo",
        endTz: "America/Los_Angeles",
      }),
    );
    expect(ev.start).toEqual({
      dateTime: "2026-05-01T17:00:00",
      timeZone: "Asia/Tokyo",
    });
    expect(ev.end).toEqual({
      dateTime: "2026-05-01T10:00:00",
      timeZone: "America/Los_Angeles",
    });
  });

  it("endAt が無い timed 予定は startAt を end にも使う", () => {
    const ev = toGcalEvent(base({ endAt: null }));
    expect(ev.end).toEqual({
      dateTime: "2026-05-01T09:00:00",
      timeZone: "Asia/Tokyo",
    });
  });

  it("空白区切り・秒なし・末尾オフセットを壁時計に正規化", () => {
    const ev = toGcalEvent(
      base({ startAt: "2026-05-01 09:00", endAt: "2026-05-01T10:30:00+09:00" }),
    );
    expect(ev.start).toMatchObject({ dateTime: "2026-05-01T09:00:00" });
    expect(ev.end).toMatchObject({ dateTime: "2026-05-01T10:30:00" });
  });

  it("location / description は中身があるときだけ出す", () => {
    const withMeta = toGcalEvent(
      base({ location: "  東京駅 ", description: " メモ " }),
    );
    expect(withMeta.location).toBe("東京駅");
    expect(withMeta.description).toBe("メモ");

    const blank = toGcalEvent(base({ location: "   ", description: "" }));
    expect(blank.location).toBeUndefined();
    expect(blank.description).toBeUndefined();
  });
});
