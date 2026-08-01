import { describe, expect, it } from "vitest";

import type { Flight } from "./flight";
import { type FlightApi, lookupFlight } from "./flightLookup";

const NRT = {
  iata: "NRT",
  icao: "RJAA",
  name: "Tokyo Narita",
  municipality: "Tokyo",
  lat: 35.7647,
  lng: 140.386,
  timeZone: "Asia/Tokyo",
  terminal: "1",
  scheduledLocal: "2026-08-05T19:10",
};
const HNL = {
  iata: "HNL",
  icao: "PHNL",
  name: "Honolulu",
  municipality: "Honolulu",
  lat: 21.3187,
  lng: -157.922,
  timeZone: "Pacific/Honolulu",
  terminal: null,
  scheduledLocal: "2026-08-05T07:50",
};

function flightOn(date: string, complete = true): Flight {
  return {
    number: "ZG002",
    airlineName: "ZIPAIR Tokyo",
    aircraftModel: "Boeing 787-8",
    departure: { ...NRT, scheduledLocal: complete ? `${date}T19:10` : null },
    arrival: { ...HNL, scheduledLocal: `${date}T07:50` },
    source: { kind: "actual" },
  };
}

/** 呼ばれた回数を数える偽 API */
function fakeApi(opts: {
  byDate?: Record<string, Flight[]>;
  dates?: string[];
}): FlightApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async byNumberAndDate(_n, date) {
      calls.push(`byDate:${date}`);
      return opts.byDate?.[date] ?? [];
    },
    async operatingDates() {
      calls.push("dates");
      return opts.dates ?? [];
    },
  };
}

describe("lookupFlight", () => {
  it("対象日に実データがあれば1回で終わる", async () => {
    const api = fakeApi({ byDate: { "2026-08-05": [flightOn("2026-08-05")] } });
    const r = await lookupFlight(api, "ZG002", "2026-08-05");

    expect(r).toEqual({ kind: "found", flight: flightOn("2026-08-05") });
    expect(api.calls).toEqual(["byDate:2026-08-05"]);
  });

  it("運航日でない日は、季節の近い運航日から予測する", async () => {
    const api = fakeApi({
      byDate: { "2026-08-05": [flightOn("2026-08-05")] },
      // 対象は 2027-08-10。直近は 2026-11-01 だが季節が近いのは 2026-08-05
      dates: ["2026-08-05", "2026-11-01"],
    });
    const r = await lookupFlight(api, "ZG002", "2027-08-10");

    expect(r.kind).toBe("found");
    if (r.kind !== "found") return;
    expect(r.flight.source).toEqual({ kind: "estimated", basedOn: "2026-08-05" });
    expect(r.flight.departure.scheduledLocal).toBe("2027-08-10T19:10");
    expect(r.flight.arrival.scheduledLocal).toBe("2027-08-10T07:50");
    // 最悪でも3回（対象日 → 運航日一覧 → 参照日）
    expect(api.calls).toEqual(["byDate:2027-08-10", "dates", "byDate:2026-08-05"]);
  });

  it("運航日が1日も無ければ便名が存在しない扱い", async () => {
    const api = fakeApi({});
    expect(await lookupFlight(api, "XX999", "2026-08-05")).toEqual({
      kind: "unknown-number",
    });
  });

  it("片側が欠けた実データは、予測で補えるなら補う", async () => {
    const api = fakeApi({
      byDate: {
        "2027-03-29": [flightOn("2027-03-29", false)],
        "2026-03-29": [flightOn("2026-03-29")],
      },
      dates: ["2026-03-29"],
    });
    const r = await lookupFlight(api, "ZG002", "2027-03-29");

    expect(r.kind).toBe("found");
    if (r.kind !== "found") return;
    expect(r.flight.source).toEqual({ kind: "estimated", basedOn: "2026-03-29" });
    expect(r.flight.departure.scheduledLocal).toBe("2027-03-29T19:10");
  });

  it("補えないときは欠けたまま返す（握りつぶさない）", async () => {
    const api = fakeApi({
      byDate: { "2027-03-29": [flightOn("2027-03-29", false)] },
      dates: ["2027-03-29"],
    });
    const r = await lookupFlight(api, "ZG002", "2027-03-29");

    expect(r.kind).toBe("found");
    if (r.kind !== "found") return;
    expect(r.flight.departure.scheduledLocal).toBeNull();
    expect(r.flight.source).toEqual({ kind: "actual" });
  });

  it("参照日を引いても揃わなければ no-data", async () => {
    const api = fakeApi({
      byDate: { "2026-08-05": [flightOn("2026-08-05", false)] },
      dates: ["2026-08-05"],
    });
    expect(await lookupFlight(api, "ZG002", "2027-08-10")).toEqual({ kind: "no-data" });
  });
});
