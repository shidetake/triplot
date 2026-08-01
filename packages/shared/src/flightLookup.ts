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

export type FlightApi = {
  /** その日の便。運航日でなければ空配列（提供元は 204 を返す） */
  byNumberAndDate(number: string, date: string): Promise<Flight[]>;
  /** その便名が運航する日の一覧 */
  operatingDates(number: string): Promise<string[]>;
};

export type LookupOutcome =
  | { kind: "found"; flight: Flight }
  /** 便名自体が見つからない（打ち間違い・存在しない便） */
  | { kind: "unknown-number" }
  /** 便は実在するが、その日の情報も予測の材料も無い */
  | { kind: "no-data" };

/**
 * 1便を解決する。呼び出し回数は最良1回・最悪3回。
 *
 * 「揃っていない答え」を握りつぶさない: 片側だけ返ったときも予測で補えるなら
 * 補い、補えなければ揃っていないまま返す（UI が欠けを見せて手入力させる）。
 */
export async function lookupFlight(
  api: FlightApi,
  number: string,
  date: string,
): Promise<LookupOutcome> {
  const exact = best(await api.byNumberAndDate(number, date));
  if (exact && isComplete(exact)) return { kind: "found", flight: exact };

  const dates = await api.operatingDates(number);
  if (dates.length === 0) {
    // 運航日が1日も無い＝その便名を提供元が知らない。ただし対象日に部分的な
    // 答えが返っていたなら便は実在するので、それを返す。
    return exact ? { kind: "found", flight: exact } : { kind: "unknown-number" };
  }

  const refDate = pickReferenceDate(date, dates);
  if (refDate === null || refDate === date) {
    return exact ? { kind: "found", flight: exact } : { kind: "no-data" };
  }

  const ref = best(await api.byNumberAndDate(number, refDate));
  if (!ref || !isComplete(ref)) {
    return exact ? { kind: "found", flight: exact } : { kind: "no-data" };
  }

  return { kind: "found", flight: estimateForDate(ref, date) };
}

/** 複数区間が返ったら、時刻の揃っている区間を優先して1つ選ぶ */
function best(flights: readonly Flight[]): Flight | null {
  if (flights.length === 0) return null;
  return (
    flights.find((f) => isComplete(f)) ??
    flights.reduce((a, b) =>
      (a.departure.scheduledLocal ?? "") <= (b.departure.scheduledLocal ?? "") ? a : b,
    )
  );
}
