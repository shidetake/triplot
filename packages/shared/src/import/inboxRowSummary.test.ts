import { describe, expect, it } from "vitest";

import { inboxRowSummary } from "./inboxRowSummary";
import type { InboxRow } from "./inboxRows";

const row = (over: Partial<InboxRow>): InboxRow => ({
  id: "e1",
  receipt: null,
  events: [],
  own: null,
  assignedTripId: null,
  defaultTripId: "",
  children: [],
  ...over,
});

const opts = {
  locale: "ja",
  subject: null,
  fallbackTitle: "(店名不明)",
  formatAmount: (t: number, c: string) => `${t} ${c}`,
};

const receipt = (over: object = {}) =>
  ({
    merchant: "Uber",
    total: 20.94,
    currency: "USD",
    category: "現地移動",
    date: "2026-05-03",
    serviceDate: null,
    time: null,
    location: null,
    referenceId: null,
    isUpdate: false,
    ...over,
  }) as InboxRow["receipt"];

const event = (over: object = {}) =>
  ({
    kind: "timed",
    title: "移動",
    startDate: "2026-05-02",
    startTime: "15:14",
    endDate: "2026-05-02",
    endTime: "15:31",
    location: null,
    departLocation: null,
    arriveLocation: null,
    departTz: null,
    arriveTz: null,
    vehicleNumber: null,
    departTerminal: null,
    arriveTerminal: null,
    referenceId: null,
    isUpdate: false,
    ...over,
  }) as unknown as InboxRow["events"][number];

describe("inboxRowSummary", () => {
  it("名前は店名。カテゴリと予定タイトルは載せない（旅行の判断に効かない）", () => {
    const s = inboxRowSummary(row({ receipt: receipt(), events: [event()] }), opts);
    expect(s.title).toBe("Uber");
    expect(s.parts.join(" ")).not.toContain("現地移動");
    expect(s.parts.join(" ")).not.toContain("移動");
  });

  it("日付は1つだけ。予定があれば予定の開始（費用の日付とずれても混ぜない）", () => {
    const s = inboxRowSummary(row({ receipt: receipt(), events: [event()] }), opts);
    expect(s.parts).toEqual(["20.94 USD", "5/2(土) 15:14"]);
  });

  it("予定が無ければ費用の使う日", () => {
    const s = inboxRowSummary(
      row({ receipt: receipt({ serviceDate: "2026-04-28" }) }),
      opts,
    );
    expect(s.parts).toEqual(["20.94 USD", "4/28(火)"]);
  });

  it("場所は費用のものを優先し、無ければ予定から取る", () => {
    const withReceiptPlace = inboxRowSummary(
      row({
        receipt: receipt({ location: "Ala Moana Center" }),
        events: [event({ arriveLocation: "HNL" })],
      }),
      opts,
    );
    expect(withReceiptPlace.parts.at(-1)).toBe("Ala Moana Center");

    const fromEvent = inboxRowSummary(
      row({
        receipt: receipt(),
        events: [event({ kind: "transit", arriveLocation: "HNL 空港" })],
      }),
      opts,
    );
    expect(fromEvent.parts.at(-1)).toBe("HNL 空港");
  });

  it("場所が名前と同じなら出さない（2回言っても判断材料が増えない）", () => {
    const s = inboxRowSummary(
      row({
        receipt: receipt({
          merchant: "THE ROYAL BAKERY",
          location: "THE ROYAL BAKERY",
        }),
      }),
      opts,
    );
    expect(s.title).toBe("THE ROYAL BAKERY");
    expect(s.parts).toEqual(["20.94 USD", "5/3(日)"]);
  });

  it("何も取れなければ件名、それも無ければ既定の名前", () => {
    expect(inboxRowSummary(row({}), { ...opts, subject: "Fwd: 領収書" }).title)
      .toBe("Fwd: 領収書");
    expect(inboxRowSummary(undefined, opts).title).toBe("(店名不明)");
  });
});
