import { describe, expect, it } from "vitest";

import type { Flight } from "./flight";
import { localizeFlightJa } from "./flightLocalize";

const base: Flight = {
  number: "ZG002",
  airlineName: "ZIPAIR Tokyo",
  aircraftModel: null,
  departure: {
    iata: "NRT",
    icao: "RJAA",
    name: "Tokyo Narita",
    municipality: "Tokyo",
    lat: 35.7647,
    lng: 140.386,
    timeZone: "Asia/Tokyo",
    terminal: "1",
    scheduledLocal: "2026-08-05T19:10",
  },
  arrival: {
    iata: "XXX",
    icao: null,
    name: "Somewhere",
    municipality: "Nowhere",
    lat: null,
    lng: null,
    timeZone: null,
    terminal: null,
    scheduledLocal: null,
  },
  source: { kind: "actual" },
};

const table = {
  NRT: ["成田国際空港", "東京都"] as const,
  HNL: ["ホノルル国際空港", null] as const,
};

describe("localizeFlightJa", () => {
  it("表にある空港は名前も都市も日本語になる", () => {
    const f = localizeFlightJa(base, table);
    expect(f.departure.name).toBe("成田国際空港");
    expect(f.departure.municipality).toBe("東京都");
  });

  it("表に無い空港は英語のまま残す（部分的に日本語の方が読める）", () => {
    const f = localizeFlightJa(base, table);
    expect(f.arrival.name).toBe("Somewhere");
    expect(f.arrival.municipality).toBe("Nowhere");
  });

  it("都市が無い空港は提供元の都市名を残す", () => {
    const f = localizeFlightJa(
      { ...base, departure: { ...base.departure, iata: "HNL" } },
      table,
    );
    expect(f.departure.name).toBe("ホノルル国際空港");
    expect(f.departure.municipality).toBe("Tokyo"); // 元の値が残る
  });

  it("座標や時刻には触らない", () => {
    const f = localizeFlightJa(base, table);
    expect(f.departure.lat).toBe(35.7647);
    expect(f.departure.scheduledLocal).toBe("2026-08-05T19:10");
    expect(f.departure.timeZone).toBe("Asia/Tokyo");
  });
});
