import { describe, expect, it } from "vitest";

import type { Flight } from "./flight";
import {
  type FlightApi,
  lookupFlight,
  peekCachedFlight,
  pickFlightByDepartureTime,
} from "./flightLookup";

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

function segment(
  from: { iata: string; tz: string; dep: string },
  to: { iata: string; tz: string; arr: string },
): Flight {
  const end = (iata: string, tz: string, t: string) => ({
    iata,
    icao: null,
    name: iata,
    municipality: null,
    lat: 0,
    lng: 0,
    timeZone: tz,
    terminal: null,
    scheduledLocal: t,
  });
  return {
    number: "UA2610",
    airlineName: "United",
    aircraftModel: null,
    departure: end(from.iata, from.tz, from.dep),
    arrival: end(to.iata, to.tz, to.arr),
    source: { kind: "actual" },
  };
}

const LA = "America/Los_Angeles";
const ua2610 = {
  ordSfo: segment(
    { iata: "ORD", tz: "America/Chicago", dep: "2026-12-26T08:40" },
    { iata: "SFO", tz: LA, arr: "2026-12-26T11:34" },
  ),
  sfoLax: segment(
    { iata: "SFO", tz: LA, dep: "2026-12-26T13:55" },
    { iata: "LAX", tz: LA, arr: "2026-12-26T15:29" },
  ),
  laxDen: segment(
    { iata: "LAX", tz: LA, dep: "2026-12-26T19:10" },
    { iata: "DEN", tz: "America/Denver", arr: "2026-12-26T22:38" },
  ),
};

describe("lookupFlight", () => {
  it("対象日に実データがあれば1回で終わる", async () => {
    const api = fakeApi({ byDate: { "2026-08-05": [flightOn("2026-08-05")] } });
    const r = await lookupFlight(api, "ZG002", "2026-08-05");

    expect(r).toEqual({ kind: "found", flights: [flightOn("2026-08-05")] });
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
    expect(r.flights[0].source).toEqual({ kind: "estimated", basedOn: "2026-08-05" });
    expect(r.flights[0].departure.scheduledLocal).toBe("2027-08-10T19:10");
    expect(r.flights[0].arrival.scheduledLocal).toBe("2027-08-10T07:50");
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
    expect(r.flights).toHaveLength(1);
    expect(r.flights[0].departure.scheduledLocal).toBe("2026-05-04T16:20");
  });

  it("同じ便名が同じ日に複数区間を飛ぶなら、全区間を出発順に返す", async () => {
    // 実例: UA2610 は同日に ORD→SFO・SFO→LAX・LAX→DEN の3区間を飛ぶ。
    const api = fakeApi({
      byDate: { "2026-12-26": [ua2610.sfoLax, ua2610.ordSfo, ua2610.laxDen] },
    });
    const r = await lookupFlight(api, "UA2610", "2026-12-26");

    expect(r).toEqual({
      kind: "found",
      flights: [ua2610.ordSfo, ua2610.sfoLax, ua2610.laxDen],
    });
    expect(api.calls).toEqual(["byDate:2026-12-26"]);
  });

  it("複数区間の予測は、参照日の全区間から組み立てる", async () => {
    const api = fakeApi({
      byDate: { "2026-12-26": [ua2610.ordSfo, ua2610.sfoLax, ua2610.laxDen] },
      dates: ["2026-12-26"],
    });
    const r = await lookupFlight(api, "UA2610", "2027-12-26");

    expect(r.kind).toBe("found");
    if (r.kind !== "found") return;
    expect(r.flights.map((f) => f.departure.scheduledLocal)).toEqual([
      "2027-12-26T08:40",
      "2027-12-26T13:55",
      "2027-12-26T19:10",
    ]);
    expect(r.flights.every((f) => f.source.kind === "estimated")).toBe(true);
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
    expect(r.flights[0].source).toEqual({ kind: "estimated", basedOn: "2026-03-29" });
    expect(r.flights[0].departure.scheduledLocal).toBe("2027-03-29T19:10");
  });

  it("補えないときは欠けたまま返す（握りつぶさない）", async () => {
    const api = fakeApi({
      byDate: { "2027-03-29": [flightOn("2027-03-29", false)] },
      dates: ["2027-03-29"],
    });
    const r = await lookupFlight(api, "ZG002", "2027-03-29");

    expect(r.kind).toBe("found");
    if (r.kind !== "found") return;
    expect(r.flights[0].departure.scheduledLocal).toBeNull();
    expect(r.flights[0].source).toEqual({ kind: "actual" });
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
    const flights = await peekCachedFlight(api, "ZG002", "2026-08-05");

    expect(flights).toEqual([flightOn("2026-08-05")]);
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

describe("pickFlightByDepartureTime", () => {
  const all = [ua2610.ordSfo, ua2610.sfoLax, ua2610.laxDen];

  it("出発時刻が一致する区間を選ぶ", () => {
    expect(pickFlightByDepartureTime(all, "13:55")).toBe(ua2610.sfoLax);
  });

  it("一致しなければ一番近い区間", () => {
    expect(pickFlightByDepartureTime(all, "18:30")).toBe(ua2610.laxDen);
  });

  it("時刻が分からなければ先頭", () => {
    expect(pickFlightByDepartureTime(all, null)).toBe(ua2610.ordSfo);
  });

  it("候補が無ければ null", () => {
    expect(pickFlightByDepartureTime([], "10:00")).toBeNull();
  });
});
