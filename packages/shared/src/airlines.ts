// 航空会社の検索。データは airlines.generated.ts（Wikidata / CC0）。
//
// API を叩かないのは、航空会社を選ぶだけで有料枠を使うのが無駄なのと、
// 1文字ごとに候補を出したいから（往復があると入力が詰まる）。

import { AIRLINES } from "./airlines.generated";

export type Airline = {
  iata: string;
  icao: string | null;
  /** 表示名。日本語名があればそちら */
  name: string;
  /** 英語名（日本語名を表示しているときの副題や照合用） */
  englishName: string;
};

function toAirline([iata, icao, en, ja]: (typeof AIRLINES)[number]): Airline {
  return { iata, icao, name: ja ?? en, englishName: en };
}

/**
 * 航空会社名から IATA コードを引く（"Delta" → DL）。取り込み（LLM 出力）専用。
 *
 * **曖昧なら null。** 誤ったコードを返すと存在しない便を引きに行くので、
 * 「引けない」より悪い。段は2つ:
 *
 *   1. 正式名と完全一致するものが1つだけなら、それ
 *   2. 先頭1語が一致するものが**少数**なら、その中で一番知名度の高いもの
 *      （AIRLINES は知名度の降順に並んでいる）
 *
 * 2 に上限を置くのは、ブランド名は数件に絞れるのに対し、一般語は絞れないから。
 * 実測（先頭1語の一致件数）: delta 2 / united 2 / japan 3 に対し **air は 89**。
 * 上限を超えたら、どれを選んでも当てずっぽうなので諦める。
 */
const MAX_FIRST_WORD_CANDIDATES = 3;

export function airlineIataByName(name: string): string | null {
  const q = name.trim().toLowerCase();
  if (q.length < 2) return null;
  const namesOf = (row: (typeof AIRLINES)[number]) =>
    [row[2], row[3]].filter((n): n is string => !!n).map((n) => n.toLowerCase());

  const exact = AIRLINES.filter((row) => namesOf(row).some((n) => n === q));
  if (exact.length > 0) return exact.length === 1 ? exact[0][0] : null;

  const byFirstWord = AIRLINES.filter((row) =>
    namesOf(row).some((n) => n.split(/\s+/)[0] === q),
  );
  if (byFirstWord.length === 0) return null;
  return byFirstWord.length <= MAX_FIRST_WORD_CANDIDATES
    ? byFirstWord[0][0]
    : null;
}

/** IATA コードから引く（"ZG" → ZIPAIR Tokyo）。無ければ null */
export function airlineByIata(iata: string): Airline | null {
  const key = iata.trim().toUpperCase();
  const row = AIRLINES.find((a) => a[0] === key);
  return row ? toAirline(row) : null;
}

/**
 * 名前・コードの部分一致で検索する。
 *
 * 並びは「一致の質」→「知名度」の順。知名度は AIRLINES の並び順そのもの
 * （生成時にサイトリンク数の降順にしてある）。これが無いと "air" のような
 * 語で無名の航空会社が先に出てしまう。
 */
export function searchAirlines(query: string, limit = 8): Airline[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];

  const scored: { row: (typeof AIRLINES)[number]; rank: number; order: number }[] = [];
  AIRLINES.forEach((row, order) => {
    const [iata, icao, en, ja] = row;
    const rank = matchRank(q, iata, icao, en, ja);
    if (rank !== null) scored.push({ row, rank, order });
  });

  scored.sort((a, b) => a.rank - b.rank || a.order - b.order);
  return scored.slice(0, limit).map((s) => toAirline(s.row));
}

/** 小さいほど良い一致。一致しなければ null */
function matchRank(
  q: string,
  iata: string,
  icao: string | null,
  en: string,
  ja: string | null,
): number | null {
  if (iata.toLowerCase() === q) return 0;
  if (icao && icao.toLowerCase() === q) return 1;

  const names = ja ? [ja.toLowerCase(), en.toLowerCase()] : [en.toLowerCase()];
  if (names.some((n) => n.startsWith(q))) return 2;
  // 語の頭（"japan air" で "Japan Airlines" を出す。空白区切りの2語目以降）
  if (names.some((n) => n.split(/[\s・]+/).some((w) => w.startsWith(q)))) return 3;
  if (names.some((n) => n.includes(q))) return 4;
  return null;
}
