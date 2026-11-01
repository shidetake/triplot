import { describe, expect, it } from "vitest";

import {
  formatOffset,
  parseOffsetTime,
  resolveAiTime,
  withOffset,
} from "./aiTime";
import type { TripTzTimeline } from "./schedule";

// 成田 20:55 発 → ホノルル 同日 09:25 着（日付が戻る便）。8/10 は移動の日。
const hawaii: TripTzTimeline = {
  fallbackTz: "Asia/Tokyo",
  transits: [
    {
      transitId: "t1",
      departDate: "2027-08-10",
      arriveDate: "2027-08-10",
      departTz: "Asia/Tokyo",
      arriveTz: "Pacific/Honolulu",
      departTime: "20:55",
      arriveTime: "09:25",
      participantsEveryone: true,
      participantMemberIds: [],
    },
  ],
};

describe("parseOffsetTime", () => {
  it("reads offsets in the usual ISO 8601 forms", () => {
    expect(parseOffsetTime("2027-08-11T12:00-10:00")).toEqual({
      wall: "2027-08-11T12:00",
      offsetMinutes: -600,
    });
    expect(parseOffsetTime("2027-08-11T12:00:00+09:00")).toEqual({
      wall: "2027-08-11T12:00",
      offsetMinutes: 540,
    });
    expect(parseOffsetTime("2027-08-11T03:00Z")?.offsetMinutes).toBe(0);
    expect(parseOffsetTime("2027-08-11T12:00+0530")?.offsetMinutes).toBe(330);
  });

  it("refuses times without an offset", () => {
    expect(parseOffsetTime("2027-08-11T12:00")).toBeNull();
    expect(parseOffsetTime("2027-08-11")).toBeNull();
    expect(parseOffsetTime("2027-08-11T25:00+09:00")).toBeNull();
  });
});

describe("withOffset / formatOffset", () => {
  it("writes the local time with the zone's offset", () => {
    expect(withOffset("2027-08-11T12:00:00", "Pacific/Honolulu")).toBe(
      "2027-08-11T12:00-10:00",
    );
    expect(formatOffset(330)).toBe("+05:30");
  });
});

describe("resolveAiTime", () => {
  it("accepts a local time whose offset matches the trip's zone that day", () => {
    const r = resolveAiTime(
      parseOffsetTime("2027-08-11T12:00-10:00")!,
      hawaii,
      "start",
    );
    expect(r).toEqual({
      ok: true,
      wall: "2027-08-11T12:00:00",
      tz: "Pacific/Honolulu",
      disambig: null,
    });
  });

  it("refuses a Japan-time offset on a Hawaii day, and says how to fix it", () => {
    const r = resolveAiTime(
      parseOffsetTime("2027-08-12T07:00+09:00")!,
      hawaii,
      "start",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain("Pacific/Honolulu (UTC-10:00)");
      expect(r.message).toContain("send 2027-08-12T07:00-10:00");
    }
  });

  it("on a travel day, picks the side whose offset matches", () => {
    const dinner = resolveAiTime(
      parseOffsetTime("2027-08-10T18:00+09:00")!,
      hawaii,
      "start",
    );
    expect(dinner).toMatchObject({
      ok: true,
      tz: "Asia/Tokyo",
      disambig: { transitId: "t1", side: "depart" },
    });
    const breakfast = resolveAiTime(
      parseOffsetTime("2027-08-10T11:00-10:00")!,
      hawaii,
      "start",
    );
    expect(breakfast).toMatchObject({
      ok: true,
      tz: "Pacific/Honolulu",
      disambig: { transitId: "t1", side: "arrive" },
    });
  });

  it("on a travel day, refuses an offset that matches neither side", () => {
    const r = resolveAiTime(
      parseOffsetTime("2027-08-10T12:00+00:00")!,
      hawaii,
      "start",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain("Asia/Tokyo (UTC+09:00) or Pacific/Honolulu (UTC-10:00)");
    }
  });

  it("trusts the local time when the trip has no transit to tell where it is", () => {
    const r = resolveAiTime(
      parseOffsetTime("2027-08-11T12:00-10:00")!,
      { fallbackTz: "Asia/Tokyo", transits: [] },
      "start",
    );
    expect(r).toEqual({
      ok: true,
      wall: "2027-08-11T12:00:00",
      tz: null,
      disambig: null,
    });
  });
});
