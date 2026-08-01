// AeroDataBox の応答を Flight（提供元非依存の型）に変換する層。
//
// **提供元の応答の形を知っているのはこのファイルだけ。** 乗り換えるときは
// ここを差し替える。flight.ts と UI は触らない。
//
// 提供元の選定理由と実測した癖は docs/design/flight-lookup.md。要点だけ:
// - 空港の座標と IANA タイムゾーンが1回の応答に含まれる（他社は別APIが要る）
// - 遠い日付では**片側だけ欠けた**応答が返る。quality が空配列なのが目印
// - 運航日でない日は 204（空ボディ）。エラーではない

import type { Flight, FlightEndpoint } from "./flight";

type RawTime = { utc?: string | null; local?: string | null } | null;

type RawAirport = {
  iata?: string | null;
  icao?: string | null;
  name?: string | null;
  shortName?: string | null;
  municipalityName?: string | null;
  location?: { lat?: number | null; lon?: number | null } | null;
  timeZone?: string | null;
} | null;

type RawMovement = {
  airport?: RawAirport;
  scheduledTime?: RawTime;
  terminal?: string | null;
  quality?: string[] | null;
} | null;

export type RawAeroDataBoxFlight = {
  number?: string | null;
  departure?: RawMovement;
  arrival?: RawMovement;
  aircraft?: { model?: string | null } | null;
  airline?: { name?: string | null } | null;
};

/**
 * "2026-08-05 19:10+09:00" → "2026-08-05T19:10"（壁時計）。
 * オフセットは捨てる。triplot は壁時計 + IANA で持つ設計で、オフセットは
 * 表示のたびに TZ から解決する（docs/design/timezone.md）。
 */
function toWallClock(t: RawTime): string | null {
  const local = t?.local;
  if (!local) return null;
  const m = local.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}` : null;
}

function toEndpoint(m: RawMovement): FlightEndpoint {
  const a = m?.airport;
  return {
    iata: a?.iata ?? null,
    icao: a?.icao ?? null,
    // 名前だけは必ず何か入れる（部分応答でも空港名は来る）
    name: a?.name ?? a?.shortName ?? a?.iata ?? "",
    municipality: a?.municipalityName ?? null,
    lat: a?.location?.lat ?? null,
    lng: a?.location?.lon ?? null,
    timeZone: a?.timeZone ?? null,
    terminal: m?.terminal ?? null,
    scheduledLocal: toWallClock(m?.scheduledTime ?? null),
  };
}

/**
 * 応答（配列）を Flight[] に変換する。
 *
 * 配列なのは、同じ便名が経由地で複数区間に分かれることがあるため。
 * どれを使うかは呼び出し側が決める（UI で選ばせる余地を残す）。
 *
 * number は**利用者が打った形**を使う。提供元は "ZG 2" と正規化して返すが、
 * 券面は "ZG002" なので、そのまま見せた方が照合しやすい。
 */
export function parseAeroDataBoxFlights(
  raw: unknown,
  requestedNumber: string,
): Flight[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawAeroDataBoxFlight[]).map((f) => ({
    number: requestedNumber,
    airlineName: f.airline?.name ?? "",
    aircraftModel: f.aircraft?.model ?? null,
    departure: toEndpoint(f.departure ?? null),
    arrival: toEndpoint(f.arrival ?? null),
    source: { kind: "actual" as const },
  }));
}

/**
 * 複数区間が返ったときにどれを採るか。
 * 両端に時刻がある区間を優先し、その中で最も早い出発。
 */
export function pickBestFlight(flights: readonly Flight[]): Flight | null {
  if (flights.length === 0) return null;
  const scored = [...flights].sort((a, b) => {
    const ca = a.departure.scheduledLocal && a.arrival.scheduledLocal ? 0 : 1;
    const cb = b.departure.scheduledLocal && b.arrival.scheduledLocal ? 0 : 1;
    if (ca !== cb) return ca - cb;
    return (a.departure.scheduledLocal ?? "").localeCompare(
      b.departure.scheduledLocal ?? "",
    );
  });
  return scored[0];
}

/** 運航日一覧の応答（["2026-08-01", ...]）を検証して返す */
export function parseOperatingDates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d),
  );
}
