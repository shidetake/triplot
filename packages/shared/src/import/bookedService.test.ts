import { describe, expect, it } from "vitest";

import { isBookedService } from "./bookedService";
import type { StoredEventDraft } from "./drafts";

function ev(p: Partial<StoredEventDraft>): StoredEventDraft {
  return {
    kind: "transit",
    title: "NRT-HNL",
    service: "flight",
    startDate: "2026-08-01",
    startTime: "21:00",
    endDate: "2026-08-01",
    endTime: "09:35",
    departTz: "Asia/Tokyo",
    arriveTz: "Pacific/Honolulu",
    vehicleNumber: "NH184",
    departTerminal: null,
    arriveTerminal: null,
    departLocation: "成田国際空港",
    arriveLocation: "ダニエル・K・イノウエ国際空港",
    location: null,
    address: null,
    referenceId: null,
    isUpdate: false,
    timeFromReceipt: false,
    ...p,
  };
}

describe("isBookedService", () => {
  it("航空券・列車・宿泊・レストラン予約は予約済み", () => {
    expect(isBookedService(ev({ service: "flight" }))).toBe(true);
    expect(isBookedService(ev({ service: "rail" }))).toBe(true);
    expect(isBookedService(ev({ kind: "allday", service: "lodging" }))).toBe(
      true,
    );
    expect(isBookedService(ev({ kind: "timed", service: "dining" }))).toBe(
      true,
    );
  });

  it("配車・タクシーは乗った後の領収書なので予約ではない", () => {
    expect(isBookedService(ev({ service: "ride" }))).toBe(false);
  });

  it("どれにも当たらないものは予約済みにしない", () => {
    expect(isBookedService(ev({ kind: "timed", service: "other" }))).toBe(
      false,
    );
  });

  it("推定の予定は、飲食でも予約ではない", () => {
    expect(
      isBookedService(
        ev({ kind: "timed", service: "dining", timeFromReceipt: true }),
      ),
    ).toBe(false);
  });

  it("種類を持たない古い下書きは、便名で引けたフライトだけ予約済み", () => {
    const old = ev({});
    delete (old as Partial<StoredEventDraft>).service;
    expect(isBookedService(old)).toBe(false);
    expect(
      isBookedService({
        ...old,
        resolvedFlight: {} as NonNullable<StoredEventDraft["resolvedFlight"]>,
      }),
    ).toBe(true);
  });
});
