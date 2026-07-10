import { describe, expect, it } from "vitest";

import { eventDraftWhenLabel, monthDayLabel } from "./draftLabel";
import type { EventDraft } from "./schema";

describe("monthDayLabel", () => {
  it("年を省いた M/D（ゼロ埋めなし）にする", () => {
    expect(monthDayLabel("2026-01-05")).toBe("1/5");
    expect(monthDayLabel("2026-11-28")).toBe("11/28");
  });
});

function draft(p: Partial<EventDraft>): EventDraft {
  return {
    kind: "timed",
    title: "ハイキング",
    startDate: "2026-08-01",
    startTime: "09:00",
    endDate: null,
    endTime: null,
    departTz: null,
    arriveTz: null,
    vehicleNumber: null,
    departTerminal: null,
    arriveTerminal: null,
    departLocation: null,
    arriveLocation: null,
    location: null,
    referenceId: null,
    isUpdate: false,
    ...p,
  };
}

describe("eventDraftWhenLabel", () => {
  it("timed は開始日+時刻のみ", () => {
    expect(eventDraftWhenLabel(draft({}), "ja")).toBe("8/1(土) 09:00");
  });

  it("allday は開始→終了（終了が無ければ開始のみ）", () => {
    expect(
      eventDraftWhenLabel(
        draft({ kind: "allday", startTime: null, endDate: "2026-08-05" }),
        "ja",
      ),
    ).toBe("8/1(土) → 8/5(水)");
    expect(
      eventDraftWhenLabel(draft({ kind: "allday", startTime: null }), "ja"),
    ).toBe("8/1(土)");
  });

  it("transit は開始 → 終了（矢印区切り）", () => {
    const label = eventDraftWhenLabel(
      draft({
        kind: "transit",
        startTime: "21:05",
        endDate: "2026-08-01",
        endTime: "09:55",
      }),
      "ja",
    );
    expect(label).toBe("8/1(土) 21:05 → 8/1(土) 09:55");
  });
});
