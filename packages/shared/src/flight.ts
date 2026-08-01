// フライト番号から予定を埋めるためのドメイン型と純粋ロジック。
//
// **どのデータ提供元にも依存しない。** 提供元固有の応答の形を知っているのは
// flightAeroDataBox.ts だけで、ここは正規化済みの型だけを扱う。乗り換えが
// 起きても差し替えるのはあちらの1ファイル。
//
// 背景（実測にもとづく設計判断）は docs/design/flight-lookup.md。

import { addDays, parseWall, utcMsToWallClock, wallClockToUtcMs } from "./schedule";

// ────────────────────────────────────────────────
// 便名
// ────────────────────────────────────────────────

export type ParsedFlightNumber = {
  /** IATA 航空会社コード（2文字・大文字） */
  airline: string;
  /** 便数字。ユーザーが打ったゼロ埋めを保つ（券面が "ZG002" なら "002"） */
  digits: string;
  /** 照会・表示に使う正規形 "ZG002" */
  normalized: string;
};

// IATA の航空会社コードは2文字で、英字2つ（JL）・英字+数字（ZG は英字2つだが
// 9C・5J のような数字始まりもある）。数字2つの組み合わせは存在しない。
const FLIGHT_NUMBER_RE = /^([A-Z][A-Z0-9]|[0-9][A-Z])[ -]?(\d{1,4})([A-Z]?)$/;

/**
 * ユーザー入力を便名として解釈する。解釈できなければ null（＝航空会社名の
 * 検索に回す）。"zg 002" "ZG-002" "ZG002" はすべて同じ便として扱う。
 */
export function parseFlightNumber(input: string): ParsedFlightNumber | null {
  const s = input.trim().toUpperCase().replace(/\s+/g, " ");
  const m = s.match(FLIGHT_NUMBER_RE);
  if (!m) return null;
  const [, airline, digits, suffix] = m;
  return { airline, digits, normalized: `${airline}${digits}${suffix}` };
}

/**
 * 便名として解釈できない入力を、航空会社名の検索語とみなすか。
 * 数字を含まない2文字以上を航空会社名の入力中と見る（"zip" → ZIPAIR）。
 */
export function looksLikeAirlineQuery(input: string): boolean {
  const s = input.trim();
  return s.length >= 2 && !/\d/.test(s) && parseFlightNumber(s) === null;
}

// ────────────────────────────────────────────────
// 便の内容
// ────────────────────────────────────────────────

export type FlightEndpoint = {
  iata: string | null;
  icao: string | null;
  /** 空港名（"Tokyo Narita"）。場所として登録するときの名前 */
  name: string;
  /** 都市名（"Tokyo"）。予定のタイトルに使う */
  municipality: string | null;
  lat: number | null;
  lng: number | null;
  /** IANA。提供元が返さなければ座標から導出する（placeTimezone） */
  timeZone: string | null;
  terminal: string | null;
  /** 現地の壁時計 "YYYY-MM-DDTHH:MM"。不明なら null */
  scheduledLocal: string | null;
};

export type FlightSource =
  /** 対象日そのものの実データ */
  | { kind: "actual" }
  /** 別の日の実績から推定した。basedOn はその日付 */
  | { kind: "estimated"; basedOn: string };

export type Flight = {
  /** "ZG002" */
  number: string;
  airlineName: string;
  aircraftModel: string | null;
  departure: FlightEndpoint;
  arrival: FlightEndpoint;
  source: FlightSource;
};

/** 出発地と到着地の両方に時刻が揃っているか（片側だけ返ることが実際にある） */
export function isComplete(f: Flight): boolean {
  return f.departure.scheduledLocal !== null && f.arrival.scheduledLocal !== null;
}

/**
 * 所要時間（分）。両端の時刻と TZ が揃っているときだけ出せる。
 * 壁時計の引き算ではなく絶対時刻の差なので、時差もサマータイムも織り込み済み。
 */
export function durationMinutes(f: Flight): number | null {
  const { departure: d, arrival: a } = f;
  if (!d.scheduledLocal || !a.scheduledLocal || !d.timeZone || !a.timeZone) return null;
  const ms =
    wallClockToUtcMs(a.scheduledLocal, a.timeZone) -
    wallClockToUtcMs(d.scheduledLocal, d.timeZone);
  return Math.round(ms / 60000);
}

// ────────────────────────────────────────────────
// 予測（対象日に実データが無いとき）
// ────────────────────────────────────────────────

/** "YYYY-MM-DD" → 1月1日からの通算日（うるう年の差は無視してよい粒度） */
function dayOfYear(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000);
}

/** 年をまたぐ「季節としての近さ」。0〜182 日 */
function seasonalDistance(a: string, b: string): number {
  const diff = Math.abs(dayOfYear(a) - dayOfYear(b));
  return Math.min(diff, 365 - diff);
}

/**
 * 予測の元にする日を運航日一覧から選ぶ。
 *
 * **季節が最優先**。航空会社の時刻表は夏ダイヤ/冬ダイヤで組み替わるので、
 * 「直近の日」より「対象日と同じ時期の日」の方が当たる（実測: ZG002 は
 * 1年離れても出発時刻が完全一致する一方、季節をまたぐと所要時間が
 * 25分動いた）。同率なら新しい方を採る。
 */
export function pickReferenceDate(
  targetDate: string,
  operatingDates: readonly string[],
): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const d of operatingDates) {
    if (d === targetDate) return d; // 対象日そのものがあるなら文句なし
    const dist = seasonalDistance(d, targetDate);
    if (dist < bestDist || (dist === bestDist && best !== null && d > best)) {
      best = d;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * 参照日の便を対象日にずらして予測を作る。
 *
 * **出発の現地時刻をそのまま移し、到着は所要時間から計算し直す。**
 * 到着の現地時刻をコピーすると、参照日と対象日でサマータイムの有無が
 * 違うときに1時間ずれる（実測で出発時刻は不動、到着だけが動く）。
 */
export function estimateForDate(reference: Flight, targetDate: string): Flight {
  const dep = reference.departure;
  const arr = reference.arrival;
  const dur = durationMinutes(reference);

  if (!dep.scheduledLocal || dur === null || !dep.timeZone || !arr.timeZone) {
    // 時刻が揃っていない参照からは時刻を作れない。経路情報だけ引き継ぐ。
    return {
      ...reference,
      departure: { ...dep, scheduledLocal: null },
      arrival: { ...arr, scheduledLocal: null },
      source: { kind: "estimated", basedOn: refDate(reference) },
    };
  }

  const { minutes } = parseWall(dep.scheduledLocal);
  const depWall = `${targetDate}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  const arrWall = utcMsToWallClock(
    wallClockToUtcMs(depWall, dep.timeZone) + dur * 60000,
    arr.timeZone,
  );

  return {
    ...reference,
    departure: { ...dep, scheduledLocal: depWall },
    arrival: { ...arr, scheduledLocal: arrWall },
    source: { kind: "estimated", basedOn: refDate(reference) },
  };
}

function refDate(f: Flight): string {
  return (f.departure.scheduledLocal ?? "").slice(0, 10);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// ────────────────────────────────────────────────
// 予定への変換
// ────────────────────────────────────────────────

/**
 * 予定のタイトル。"ZG002 東京 → ホノルル"。
 * 便名を先頭に置くのは、一覧やカレンダーで幅が詰まったとき先頭が残るため。
 * 空港名でなく都市名なのは、見出しとして読みやすいから（空港そのものは
 * 出発地・到着地の欄に入る）。
 */
export function flightTitle(f: Flight): string {
  const from = f.departure.municipality ?? f.departure.name;
  const to = f.arrival.municipality ?? f.arrival.name;
  return `${f.number} ${from} → ${to}`;
}

/**
 * 日をまたぐ便か（出発日と到着日が違う）。予定の終了日を出すのに使う。
 * 日付変更線を西向きに越えると到着が前日になることもあるので符号は見ない。
 */
export function crossesDate(f: Flight): boolean {
  const d = f.departure.scheduledLocal?.slice(0, 10);
  const a = f.arrival.scheduledLocal?.slice(0, 10);
  return d !== undefined && a !== undefined && d !== a;
}

/** 参照日の便が対象日の何日ずれかを見る（デバッグ・表示用） */
export function dayOffset(from: string, to: string): number {
  let n = 0;
  let cur = from;
  const forward = from < to;
  while (cur !== to && Math.abs(n) < 400) {
    cur = addDays(cur, forward ? 1 : -1);
    n += forward ? 1 : -1;
  }
  return n;
}
