import { describe, expect, it } from "vitest";

import type { Flight } from "./flight";
import { type FlightApi, lookupFlight, peekCachedFlight } from "./flightLookup";

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
  peekByDate?: Record<string, Flight[]>;
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
    async peekByNumberAndDate(_n, date) {
      calls.push(`peek:${date}`);
      return opts.peekByDate?.[date] ?? null;
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

  it("提供元が出発日/到着日どちらかが一致する複数便を返しても、出発が対象日の便を選ぶ", async () => {
    // 実測: DL181 を date=2026-05-04 で引くと、5/3出発/5/4到着便と
    // 5/4出発/5/5到着便の2件が返る（提供元は出発 or 到着どちらかの現地日付が
    // 一致すれば緩く返す）。長押しした日＝出発日として引いているので、
    // 5/4出発の便を選ばないと「1日前が登録される」不具合になる。
    const depMay3: Flight = {
      number: "DL181",
      airlineName: "Delta Air Lines",
      aircraftModel: "Boeing 767-300",
      departure: { ...HNL, scheduledLocal: "2026-05-03T16:20" },
      arrival: { ...NRT, scheduledLocal: "2026-05-04T20:00" },
      source: { kind: "actual" },
    };
    const depMay4: Flight = {
      number: "DL181",
      airlineName: "Delta Air Lines",
      aircraftModel: "Boeing 767-300",
      departure: { ...HNL, scheduledLocal: "2026-05-04T16:20" },
      arrival: { ...NRT, scheduledLocal: "2026-05-05T20:00" },
      source: { kind: "actual" },
    };
    const api = fakeApi({ byDate: { "2026-05-04": [depMay3, depMay4] } });

    const r = await lookupFlight(api, "DL181", "2026-05-04");

    expect(r.kind).toBe("found");
    if (r.kind !== "found") return;
    expect(r.flight.departure.scheduledLocal).toBe("2026-05-04T16:20");
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

describe("peekCachedFlight", () => {
  it("キャッシュに揃った答えがあれば提供元を叩かず返す", async () => {
    const api = fakeApi({
      peekByDate: { "2026-08-05": [flightOn("2026-08-05")] },
    });
    const flight = await peekCachedFlight(api, "ZG002", "2026-08-05");

    expect(flight).toEqual(flightOn("2026-08-05"));
    expect(api.calls).toEqual(["peek:2026-08-05"]);
  });

  it("キャッシュに無ければ null（呼び出し側が通常の lookupFlight へ進む）", async () => {
    const api = fakeApi({});
    expect(await peekCachedFlight(api, "ZG002", "2026-08-05")).toBeNull();
  });

  it("キャッシュはあるが片側欠けなら null 扱い（揃った答えだけ即答する）", async () => {
    const api = fakeApi({
      peekByDate: { "2026-08-05": [flightOn("2026-08-05", false)] },
    });
    expect(await peekCachedFlight(api, "ZG002", "2026-08-05")).toBeNull();
  });

  it("peekByNumberAndDate 未実装の FlightApi では null（テストの fake 等）", async () => {
    const api: FlightApi = {
      async byNumberAndDate() {
        return [];
      },
      async operatingDates() {
        return [];
      },
    };
    expect(await peekCachedFlight(api, "ZG002", "2026-08-05")).toBeNull();
  });
});
