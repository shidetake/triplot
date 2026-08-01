import { describe, expect, it } from "vitest";

import {
  crossesDate,
  durationMinutes,
  estimateForDate,
  type Flight,
  flightTitle,
  isComplete,
  looksLikeAirlineQuery,
  parseFlightNumber,
  pickReferenceDate,
} from "./flight";

describe("parseFlightNumber", () => {
  it("券面の書き方の揺れを同じ便として扱う", () => {
    for (const s of ["ZG002", "zg002", "ZG 002", "zg-002", " ZG002 "]) {
      expect(parseFlightNumber(s)?.normalized).toBe("ZG002");
    }
  });

  it("ゼロ埋めは打たれたまま保つ（券面に合わせる）", () => {
    expect(parseFlightNumber("ZG2")?.normalized).toBe("ZG2");
    expect(parseFlightNumber("ZG002")?.digits).toBe("002");
  });

  it("数字始まりの航空会社コードも通す（9C・5J）", () => {
    expect(parseFlightNumber("9C8888")?.airline).toBe("9C");
    expect(parseFlightNumber("5J814")?.airline).toBe("5J");
  });

  it("運用サフィックス付きも通す", () => {
    expect(parseFlightNumber("BA117A")?.normalized).toBe("BA117A");
  });

  it("便名でないものは null", () => {
    for (const s of ["", "Z", "zipair", "12345", "成田", "ZG"]) {
      expect(parseFlightNumber(s)).toBeNull();
    }
  });
});

describe("looksLikeAirlineQuery", () => {
  it("数字を含まない2文字以上は航空会社名の入力中とみなす", () => {
    expect(looksLikeAirlineQuery("zip")).toBe(true);
    expect(looksLikeAirlineQuery("ZIPAIR")).toBe(true);
    expect(looksLikeAirlineQuery("ZG")).toBe(true);
  });

  it("便名として読めるもの・短すぎるものは違う", () => {
    expect(looksLikeAirlineQuery("ZG002")).toBe(false);
    expect(looksLikeAirlineQuery("z")).toBe(false);
  });
});

// 実測値（AeroDataBox, 2026-08-05 の ZG002）をそのまま使う
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
const ZG002: Flight = {
  number: "ZG002",
  airlineName: "ZIPAIR Tokyo",
  aircraftModel: "Boeing 787-8",
  departure: NRT,
  arrival: HNL,
  source: { kind: "actual" },
};

describe("durationMinutes", () => {
  it("時差を跨いでも絶対時刻の差で出す", () => {
    // 19:10 JST 発 → 同日 07:50 HST 着 = 7h40m
    expect(durationMinutes(ZG002)).toBe(460);
  });

  it("片側が欠けていたら出せない", () => {
    expect(
      durationMinutes({ ...ZG002, arrival: { ...HNL, scheduledLocal: null } }),
    ).toBeNull();
  });
});

describe("isComplete / crossesDate", () => {
  it("両端に時刻があるか", () => {
    expect(isComplete(ZG002)).toBe(true);
    expect(isComplete({ ...ZG002, departure: { ...NRT, scheduledLocal: null } })).toBe(
      false,
    );
  });

  it("日付変更線を西→東に越えると同じ日付に着く", () => {
    expect(crossesDate(ZG002)).toBe(false);
  });

  it("日をまたぐ便を検出する", () => {
    const overnight = {
      ...ZG002,
      arrival: { ...HNL, scheduledLocal: "2026-08-06T07:50" },
    };
    expect(crossesDate(overnight)).toBe(true);
  });
});

describe("pickReferenceDate", () => {
  const dates = ["2025-10-05", "2026-04-05", "2026-05-05", "2026-07-05"];

  it("対象日そのものがあればそれ", () => {
    expect(pickReferenceDate("2026-05-05", dates)).toBe("2026-05-05");
  });

  it("直近ではなく「同じ季節」を選ぶ", () => {
    // 2027-10-20 に対して、直近は 2026-07-05 だが季節が近いのは 2025-10-05
    expect(pickReferenceDate("2027-10-20", dates)).toBe("2025-10-05");
  });

  it("季節が同率なら新しい方", () => {
    // 4/5 と 5/5 の中間(4/20)からは等距離 → 新しい 2026-05-05
    expect(pickReferenceDate("2027-04-20", ["2026-04-05", "2026-05-05"])).toBe(
      "2026-05-05",
    );
  });

  it("候補が無ければ null", () => {
    expect(pickReferenceDate("2027-04-20", [])).toBeNull();
  });
});

describe("estimateForDate", () => {
  it("出発の現地時刻は保ち、到着は所要時間から計算する", () => {
    const e = estimateForDate(ZG002, "2027-02-27");
    expect(e.departure.scheduledLocal).toBe("2027-02-27T19:10");
    expect(e.arrival.scheduledLocal).toBe("2027-02-27T07:50");
    expect(durationMinutes(e)).toBe(460);
    expect(e.source).toEqual({ kind: "estimated", basedOn: "2026-08-05" });
  });

  it("サマータイムを跨いでも所要時間が保たれる（到着の現地時刻はずれる）", () => {
    // 冬(1月)の LA 着を、夏時間の 7月 にずらす。現地時刻をコピーしていたら
    // 1時間ずれるが、所要時間から計算するのでずれない。
    const winter: Flight = {
      ...ZG002,
      departure: { ...NRT, scheduledLocal: "2027-01-10T17:00" },
      arrival: {
        ...HNL,
        iata: "LAX",
        name: "Los Angeles",
        municipality: "Los Angeles",
        timeZone: "America/Los_Angeles",
        scheduledLocal: "2027-01-10T10:00",
      },
    };
    expect(durationMinutes(winter)).toBe(600); // 10h

    const summer = estimateForDate(winter, "2027-07-10");
    expect(summer.departure.scheduledLocal).toBe("2027-07-10T17:00");
    // 夏時間なので現地時刻は 11:00（冬の 10:00 をコピーしていたら誤り）
    expect(summer.arrival.scheduledLocal).toBe("2027-07-10T11:00");
    expect(durationMinutes(summer)).toBe(600);
  });

  it("時刻が欠けた参照からは時刻を作らない（経路だけ残す）", () => {
    const partial: Flight = {
      ...ZG002,
      departure: { ...NRT, scheduledLocal: null },
    };
    const e = estimateForDate(partial, "2027-02-27");
    expect(e.departure.scheduledLocal).toBeNull();
    expect(e.arrival.scheduledLocal).toBeNull();
    expect(e.source.kind).toBe("estimated");
  });
});

describe("flightTitle", () => {
  it("便名 + 都市 → 都市", () => {
    expect(flightTitle(ZG002)).toBe("ZG002 Tokyo → Honolulu");
  });

  it("都市名が無ければ空港名で代替する", () => {
    const noCity = {
      ...ZG002,
      departure: { ...NRT, municipality: null },
    };
    expect(flightTitle(noCity)).toBe("ZG002 Tokyo Narita → Honolulu");
  });
});
