// 航空会社リスト（packages/shared/src/airlines.generated.ts）を Wikidata から生成する。
//
//   node scripts/gen-airlines.mjs
//
// **データ源に Wikidata を選んだ理由はライセンス。** この種のデータで広く使われる
// OpenFlights は ODbL（データベースのシェアアライク）で、派生データベースを配布
// するとき同じライセンスで提供する義務が付く。アプリに焼き込むには扱いが面倒。
// Wikidata は CC0（パブリックドメイン）なので制約が無い。
//
// 検索を API に頼らず静的リストにしているのは、航空会社を選ぶだけで有料枠を
// 消費するのが無駄なのと、1文字ごとに候補を出したいから（往復があると遅い）。
//
// 同じ IATA コードを複数の法人が持つ（親会社と運航子会社など）。**サイトリンク数
// ＝知名度の代理指標**が最大のものを残す。QF は Qantas Airways であって
// Eastern Australia Airlines ではない、という選択がこれで決まる。
// 出力順もサイトリンク数の降順にしてあり、検索の同点時の優先順位を兼ねる。

import { writeFileSync } from "node:fs";

const QUERY = `
SELECT ?iata ?icao ?enLabel ?jaLabel ?sitelinks WHERE {
  ?airline wdt:P229 ?iata .
  ?airline wikibase:sitelinks ?sitelinks .
  OPTIONAL { ?airline wdt:P230 ?icao }
  OPTIONAL { ?airline rdfs:label ?enLabel . FILTER(LANG(?enLabel) = "en") }
  OPTIONAL { ?airline rdfs:label ?jaLabel . FILTER(LANG(?jaLabel) = "ja") }
  FILTER NOT EXISTS { ?airline wdt:P576 ?ceased }
}`;

const OUT = new URL("../packages/shared/src/airlines.generated.ts", import.meta.url);

const res = await fetch(
  `https://query.wikidata.org/sparql?query=${encodeURIComponent(QUERY)}`,
  {
    headers: {
      accept: "application/sparql-results+json",
      "user-agent": "triplot/0.1 (https://triplot.app)",
    },
  },
);
if (!res.ok) {
  console.error(`gen-airlines: Wikidata が ${res.status} を返した`);
  process.exit(1);
}

const rows = (await res.json()).results.bindings;

/** iata -> { icao, en, ja, sitelinks } の最良1件 */
const best = new Map();
for (const r of rows) {
  const iata = r.iata?.value?.trim().toUpperCase();
  // IATA の航空会社コードは2文字。それ以外は誤登録なので捨てる。
  if (!iata || !/^[A-Z0-9]{2}$/.test(iata)) continue;
  const en = r.enLabel?.value?.trim();
  const ja = r.jaLabel?.value?.trim();
  if (!en && !ja) continue;

  const sitelinks = Number(r.sitelinks?.value ?? 0);
  const cur = best.get(iata);
  if (!cur || sitelinks > cur.sitelinks) {
    best.set(iata, { icao: r.icao?.value?.trim() ?? null, en, ja, sitelinks });
  }
}

const sorted = [...best.entries()].sort((a, b) => b[1].sitelinks - a[1].sitelinks);

// 日本語名が英語名と同じなら重複を持たない（"ZIPAIR Tokyo" など）。
const lit = (s) => (s == null ? "null" : JSON.stringify(s));
const lines = sorted.map(([iata, a]) => {
  const ja = a.ja && a.ja !== a.en ? a.ja : null;
  return `  [${lit(iata)}, ${lit(a.icao)}, ${lit(a.en ?? a.ja)}, ${lit(ja)}],`;
});

writeFileSync(
  OUT,
  `// 自動生成。手で編集しない（scripts/gen-airlines.mjs で再生成）。
// 出典: Wikidata（CC0）。運航中で IATA コードを持つ航空会社。
// 並びはサイトリンク数の降順＝知名度順で、検索の同点時の優先順位を兼ねる。
// [iata, icao, 英語名, 日本語名（英語名と同じなら null）]
export type AirlineRow = readonly [string, string | null, string, string | null];

export const AIRLINES: readonly AirlineRow[] = [
${lines.join("\n")}
];
`,
);

console.log(`gen-airlines: ${sorted.length} 社を書き出した`);
