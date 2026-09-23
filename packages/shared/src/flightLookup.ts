// 「便名 + 日付 → 便」の解決手順。提供元へのアクセスは FlightApi ポート越し
// なので、この段はネットワーク非依存でテストできる。
//
// 手順（実測にもとづく。docs/design/flight-lookup.md）:
//   ① 対象日をそのまま照会する。揃った答えが返ればそれが最良
//   ② 返らない・片側が欠けたら、運航日一覧から**季節の近い日**を選び直す
//   ③ その日の実績から対象日の時刻を組み立てる（出発時刻＋所要時間）
//
// ②が要るのは、実データが約半年先で尽きるうえ、便が毎日飛ぶとは限らない
// ため（ZG002 は隔日運航＋運休期間あり）。対象日の前後を当てずっぽうに叩くと
// 空振りを繰り返すので、運航日一覧で当たりを付けてから1回だけ引く。

import {
  estimateForDate,
  type Flight,
  isComplete,
  pickReferenceDate,
} from "./flight";

// 便名入力のたび（1文字ごと）に即 lookupFlight すると、揃うまでの中間状態
// （DL1 → DL18 → DL181）でも毎回呼ばれ、1回最大3回叩く提供元 API を連打して
// レートリミットに引っかかる（実機で確認）。UI 側は「検索中」表示はすぐ出しつつ、
// 実際の呼び出しはこの時間だけ入力が止まってから行う。
export const FLIGHT_SEARCH_DEBOUNCE_MS = 3000;

export type FlightApi = {
  /** その日の便。運航日でなければ空配列（提供元は 204 を返す） */
  byNumberAndDate(number: string, date: string): Promise<Flight[]>;
  /** その便名が運航する日の一覧 */
  operatingDates(number: string): Promise<string[]>;
  /**
   * 全ユーザー横断のキャッシュだけを覗く（提供元は叩かない）。ヒットしなければ
   * null。UI が debounce 待ちの間にこれで先当たりを試すためのもの
   * （peekCachedFlight 参照）。実装が無くてもよい（テストの fake 等）。
   */
  peekByNumberAndDate?(number: string, date: string): Promise<Flight[] | null>;
};

export type LookupOutcome =
  /**
   * 便名と出発日が一致する区間すべて（出発の早い順・1件以上）。同じ便名が
   * 同じ日に経由地で区間を分けて飛ぶことがある（実例: UA2610 は同日に
   * ORD→SFO・SFO→LAX・LAX→DEN の3区間）ので、どれに乗るかは利用者が選ぶ。
   */
  | { kind: "found"; flights: Flight[] }
  /** 便名自体が見つからない（打ち間違い・存在しない便） */
  | { kind: "unknown-number" }
  /** 便は実在するが、その日の情報も予測の材料も無い */
  | { kind: "no-data" };

/**
 * 便を解決する。呼び出し回数は最良1回・最悪3回。
 *
 * 「揃っていない答え」を握りつぶさない: 片側だけ返ったときも予測で補えるなら
 * 補い、補えなければ揃っていないまま返す（UI が欠けを見せて手入力させる）。
 */
export async function lookupFlight(
  api: FlightApi,
  number: string,
  date: string,
): Promise<LookupOutcome> {
  const exact = candidates(await api.byNumberAndDate(number, date), date);
  if (exact.length > 0 && exact.every(isComplete)) return { kind: "found", flights: exact };

  const dates = await api.operatingDates(number);
  if (dates.length === 0) {
    // 運航日が1日も無い＝その便名を提供元が知らない。ただし対象日に部分的な
    // 答えが返っていたなら便は実在するので、それを返す。
    return exact.length > 0 ? { kind: "found", flights: exact } : { kind: "unknown-number" };
  }

  const refDate = pickReferenceDate(date, dates);
  if (refDate === null || refDate === date) {
    return exact.length > 0 ? { kind: "found", flights: exact } : { kind: "no-data" };
  }

  const ref = candidates(await api.byNumberAndDate(number, refDate), refDate).filter(
    isComplete,
  );
  if (ref.length === 0) {
    return exact.length > 0 ? { kind: "found", flights: exact } : { kind: "no-data" };
  }

  return { kind: "found", flights: ref.map((f) => estimateForDate(f, date)) };
}

/**
 * debounce を待たず、対象日ぶんのキャッシュだけを覗いて即答を試す
 * （全ユーザー横断キャッシュなので、他の誰かが同じ便・同じ日を既に引いて
 * いれば提供元を叩かず即表示できる）。揃った答えがキャッシュに無ければ
 * null（呼び出し側は通常どおり debounce 後に lookupFlight を呼ぶ）。
 */
export async function peekCachedFlight(
  api: FlightApi,
  number: string,
  date: string,
): Promise<Flight[] | null> {
  const cached = await api.peekByNumberAndDate?.(number, date);
  if (!cached) return null;
  const exact = candidates(cached, date);
  return exact.length > 0 && exact.every(isComplete) ? exact : null;
}

/**
 * 候補が複数あるとき、分かっている出発時刻（"HH:MM"）に一番近い区間を選ぶ。
 * 利用者に選ばせられない経路（メール取り込みの事前解決）用。時刻が無ければ
 * 先頭（最も早い出発）。
 */
export function pickFlightByDepartureTime(
  flights: readonly Flight[],
  time: string | null | undefined,
): Flight | null {
  if (flights.length === 0) return null;
  const target = time ? toMinutes(time) : null;
  if (target === null) return flights[0];
  let best = flights[0];
  let bestDiff = Infinity;
  for (const f of flights) {
    const m = f.departure.scheduledLocal
      ? toMinutes(f.departure.scheduledLocal.slice(11, 16))
      : null;
    if (m === null) continue;
    const diff = Math.abs(m - target);
    if (diff < bestDiff) {
      best = f;
      bestDiff = diff;
    }
  }
  return best;
}

function toMinutes(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * 提供元の応答から、対象日の候補を出発の早い順に返す。「複数区間」は2パターンある:
 *  ① 同じ便名が経由地で複数区間に分かれる（乗継便）→ **全部返して利用者に選ばせる**
 *  ② 提供元が「出発日 or 到着日のどちらかが対象日」を緩く一致させて返す
 *     （実測: DL181 を date=2026-05-04 で引くと、5/3出発/5/4到着便と
 *     5/4出発/5/5到着便の2件が返る）→ 関係ない便なので**落とす**
 * triplot はカレンダーで長押しした日＝出発日として便を引くので、**出発の
 * ローカル日付が対象日と一致する区間だけ**を候補にする。一致が1つも無ければ
 * （出発時刻が欠けた部分応答など）、揃っている・出発が早い順で1つだけ返す。
 */
function candidates(flights: readonly Flight[], date: string): Flight[] {
  if (flights.length === 0) return [];
  const departingOnDate = flights.filter((f) =>
    f.departure.scheduledLocal?.startsWith(date),
  );
  if (departingOnDate.length > 0) {
    return [...departingOnDate].sort((a, b) =>
      (a.departure.scheduledLocal ?? "").localeCompare(b.departure.scheduledLocal ?? ""),
    );
  }
  const fallback =
    flights.find((f) => isComplete(f)) ??
    flights.reduce((a, b) =>
      (a.departure.scheduledLocal ?? "") <= (b.departure.scheduledLocal ?? "") ? a : b,
    );
  return [fallback];
}
