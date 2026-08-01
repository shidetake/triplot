import { describe, expect, it } from "vitest";

import { durationMinutes, isComplete } from "./flight";
import {
  parseAeroDataBoxFlights,
  parseOperatingDates,
  pickBestFlight,
} from "./flightAeroDataBox";

// 実際の応答（2026-08-01 に ZG002 / 2026-08-05 を叩いたもの）をそのまま使う。
// 作り物のフィクスチャだと提供元の癖を落としてしまうため。
const REAL_ZG002 = [
  {
    greatCircleDistance: { km: 6145.59 },
    departure: {
      airport: {
        icao: "RJAA",
        iata: "NRT",
        name: "Tokyo Narita",
        shortName: "Narita",
        municipalityName: "Tokyo",
        location: { lat: 35.7647, lon: 140.386 },
        countryCode: "JP",
        timeZone: "Asia/Tokyo",
      },
      scheduledTime: { utc: "2026-08-05 10:10Z", local: "2026-08-05 19:10+09:00" },
      terminal: "1",
      quality: ["Basic"],
    },
    arrival: {
      airport: {
        icao: "PHNL",
        iata: "HNL",
        name: "Honolulu",
        shortName: "Honolulu",
        municipalityName: "Honolulu",
        location: { lat: 21.3187, lon: -157.922 },
        countryCode: "US",
        timeZone: "Pacific/Honolulu",
      },
      scheduledTime: { utc: "2026-08-05 17:50Z", local: "2026-08-05 07:50-10:00" },
      predictedTime: { utc: "2026-08-05 17:22Z", local: "2026-08-05 07:22-10:00" },
      quality: ["Basic"],
    },
    number: "ZG 2",
    status: "Expected",
    isCargo: false,
    aircraft: { model: "Boeing 787-8" },
    airline: { name: "ZIPAIR Tokyo", iata: "ZG", icao: "TZP" },
  },
];

// 遠い日付で実際に返ってきた「片側が欠けた」応答（UA800 / 2027-03-29）。
const REAL_PARTIAL_UA800 = [
  {
    departure: { airport: { name: "Boston" }, quality: [] },
    arrival: {
      airport: {
        icao: "KDEN",
        iata: "DEN",
        name: "Denver",
        shortName: "Denver",
        municipalityName: "Denver",
        location: { lat: 39.8617, lon: -104.673 },
        countryCode: "US",
        timeZone: "America/Denver",
      },
      scheduledTime: { utc: "2027-03-30 01:38Z", local: "2027-03-29 19:38-06:00" },
      quality: ["Basic"],
    },
    number: "UA 800",
    aircraft: { model: "Airbus A320" },
    airline: { name: "United Airlines", iata: "UA", icao: "UAL" },
  },
];

describe("parseAeroDataBoxFlights", () => {
  it("実応答から必要な項目を全部取り出す", () => {
    const [f] = parseAeroDataBoxFlights(REAL_ZG002, "ZG002");
    expect(f.number).toBe("ZG002"); // 提供元の "ZG 2" ではなく打たれた形
    expect(f.airlineName).toBe("ZIPAIR Tokyo");
    expect(f.aircraftModel).toBe("Boeing 787-8");
    expect(f.departure).toMatchObject({
      iata: "NRT",
      name: "Tokyo Narita",
      municipality: "Tokyo",
      lat: 35.7647,
      lng: 140.386,
      timeZone: "Asia/Tokyo",
      terminal: "1",
      scheduledLocal: "2026-08-05T19:10",
    });
    expect(f.arrival).toMatchObject({
      iata: "HNL",
      timeZone: "Pacific/Honolulu",
      scheduledLocal: "2026-08-05T07:50",
    });
    expect(durationMinutes(f)).toBe(460);
  });

  it("オフセットは落として壁時計にする", () => {
    const [f] = parseAeroDataBoxFlights(REAL_ZG002, "ZG002");
    expect(f.departure.scheduledLocal).not.toContain("+");
  });

  it("片側が欠けた応答でも落ちず、欠けを null で表す", () => {
    const [f] = parseAeroDataBoxFlights(REAL_PARTIAL_UA800, "UA800");
    expect(isComplete(f)).toBe(false);
    expect(f.departure.name).toBe("Boston");
    expect(f.departure.iata).toBeNull();
    expect(f.departure.lat).toBeNull();
    expect(f.departure.timeZone).toBeNull();
    expect(f.departure.scheduledLocal).toBeNull();
    // 揃っている側は普通に読める
    expect(f.arrival.iata).toBe("DEN");
    expect(f.arrival.scheduledLocal).toBe("2027-03-29T19:38");
  });

  it("配列でないもの・空は空配列", () => {
    expect(parseAeroDataBoxFlights(null, "ZG002")).toEqual([]);
    expect(parseAeroDataBoxFlights({}, "ZG002")).toEqual([]);
    expect(parseAeroDataBoxFlights([], "ZG002")).toEqual([]);
  });
});

describe("pickBestFlight", () => {
  it("両端に時刻がある区間を優先する", () => {
    const partial = parseAeroDataBoxFlights(REAL_PARTIAL_UA800, "X1")[0];
    const full = parseAeroDataBoxFlights(REAL_ZG002, "X1")[0];
    expect(pickBestFlight([partial, full])).toBe(full);
  });

  it("候補が無ければ null", () => {
    expect(pickBestFlight([])).toBeNull();
  });
});

describe("parseOperatingDates", () => {
  it("日付の配列だけ通す", () => {
    expect(parseOperatingDates(["2026-08-01", "2026-08-03"])).toEqual([
      "2026-08-01",
      "2026-08-03",
    ]);
  });

  it("ゴミは落とす", () => {
    expect(parseOperatingDates(["2026-08-01", "", "abc", 42, null])).toEqual([
      "2026-08-01",
    ]);
    expect(parseOperatingDates({ message: "error" })).toEqual([]);
  });
});
