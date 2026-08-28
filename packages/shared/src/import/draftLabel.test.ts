import { describe, expect, it } from "vitest";

import {
  eventDraftWhenLabel,
  extractionSummary,
  monthDayLabel,
} from "./draftLabel";
import type { EventDraft, Receipt } from "./schema";

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
    address: null,
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

describe("extractionSummary", () => {
  it("レシートがあれば店名・金額・日付を出す", () => {
    expect(
      extractionSummary(
        {
          receipt: {
            merchant: "Yard House",
            total: 42.5,
            currency: "USD",
            date: "2026-05-01",
          } as Receipt,
          events: [],
        },
        "(店名不明)",
      ),
    ).toEqual({ title: "Yard House", amount: "42.5 USD", date: "2026-05-01" });
  });

  it("レシートが無ければ先頭の予定のタイトル・開始日を使う", () => {
    expect(
      extractionSummary(
        {
          receipt: null,
          events: [
            {
              title: "JL784",
              startDate: "2026-04-28",
              kind: "transit",
            } as EventDraft,
          ],
        },
        "(店名不明)",
      ),
    ).toEqual({ title: "JL784", amount: null, date: "2026-04-28" });
  });

  it("何も抽出できていなければフォールバックの文言", () => {
    expect(extractionSummary(null, "(店名不明)")).toEqual({
      title: "(店名不明)",
      amount: null,
      date: null,
    });
  });
});
