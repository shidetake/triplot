// 提供元が返す英語の空港名・都市名を日本語に差し替える。
//
// AeroDataBox は "Tokyo Narita" / "Honolulu" しか返さない。日本語で使うアプリなので
// 予定のタイトルにも地図のピンにも日本語で載せたい。
//
// **対訳表（airportsJa.generated.ts）は 350KB あるので動的 import する。**
// 初期バンドルに載せず、フライトを引いた時だけ読む。読み込みに失敗しても英語名の
// まま動く（差し替えは表示上の改善であって、機能の前提ではない）。

import type { Flight, FlightEndpoint } from "./flight";

export type AirportNameTable = Record<string, readonly [string, string | null]>;

/**
 * 空港名と都市名を日本語にする。表に無い空港は英語のまま残す（部分的に日本語に
 * なる方が、全部英語のままより読みやすい）。
 */
export function localizeFlightJa(flight: Flight, table: AirportNameTable): Flight {
  return {
    ...flight,
    departure: localizeEndpoint(flight.departure, table),
    arrival: localizeEndpoint(flight.arrival, table),
  };
}

function localizeEndpoint(
  e: FlightEndpoint,
  table: AirportNameTable,
): FlightEndpoint {
  const hit = e.iata ? table[e.iata] : undefined;
  if (!hit) return e;
  const [name, city] = hit;
  return { ...e, name, municipality: city ?? e.municipality };
}

/**
 * 対訳表を読み込む。ja 以外のロケールでは読まない（提供元の英語名がそのまま正解）。
 * 読めなければ null を返し、呼び出し側は英語のまま進む。
 */
export async function loadAirportNames(
  locale: string,
): Promise<AirportNameTable | null> {
  if (!locale.startsWith("ja")) return null;
  try {
    const m = await import("./airportsJa.generated");
    return m.AIRPORTS_JA;
  } catch {
    return null;
  }
}
