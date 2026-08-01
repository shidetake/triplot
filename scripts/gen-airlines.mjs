// 航空会社リストと日本語の空港名（packages/shared/src/*.generated.ts）を
// Wikidata から生成する。
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

/**
 * Wikidata の SPARQL エンドポイントを叩く。**POST で送る。**
 * 長いクエリを GET のクエリ文字列で送ると、Blazegraph が結果に診断文字列
 * （"SPARQL-QUERY: queryStr=..."）を混ぜて返すことがあり JSON が壊れる。
 */
function sparql(query) {
  return fetch("https://query.wikidata.org/sparql", {
    method: "POST",
    headers: {
      accept: "application/sparql-results+json",
      "content-type": "application/sparql-query",
      "user-agent": "triplot/0.1 (https://triplot.app)",
    },
    body: query,
  });
}

const res = await sparql(QUERY);
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

// ────────────────────────────────────────────────
// 日本語の空港名。
//
// 提供元（AeroDataBox）は英語名しか返さない（"Tokyo Narita" / "Honolulu"）。
// 日本語で使うアプリなので、空港名と就航都市だけ日本語に差し替える。
//
// 就航都市は **P931（place served by transport hub）** を使う。P131（行政区画）は
// 用途に合わない — 羽田が「大田区」、CDG が「ロワシー＝アン＝フランス」になる。
// P931 なら「東京都」「パリ」で、予定のタイトルに載せて自然な粒度になる。
//
// 300KB 近くあるので**呼び出し側は動的 import する**（初期バンドルに載せない）。
// ────────────────────────────────────────────────

const AIRPORT_QUERY = `
SELECT ?iata ?jaLabel ?cityJa ?sitelinks WHERE {
  ?airport wdt:P238 ?iata .
  ?airport wikibase:sitelinks ?sitelinks .
  ?airport rdfs:label ?jaLabel . FILTER(LANG(?jaLabel) = "ja")
  OPTIONAL {
    ?airport wdt:P931 ?city .
    ?city rdfs:label ?cityJa . FILTER(LANG(?cityJa) = "ja")
  }
}`;

const AIRPORT_OUT = new URL(
  "../packages/shared/src/airportsJa.generated.ts",
  import.meta.url,
);

const apRes = await sparql(AIRPORT_QUERY);
if (!apRes.ok) {
  console.error(`gen-airlines: 空港の取得に失敗 ${apRes.status}`);
  process.exit(1);
}

const apRows = (await apRes.json()).results.bindings;
const airports = new Map();
for (const r of apRows) {
  const iata = r.iata?.value?.trim().toUpperCase();
  if (!iata || !/^[A-Z]{3}$/.test(iata)) continue;
  const sitelinks = Number(r.sitelinks?.value ?? 0);
  const city = r.cityJa?.value?.trim() ?? null;
  const cur = airports.get(iata);
  // 同じ IATA が複数の項目に付くことがある。知名度優先、同点なら都市が取れる方。
  if (!cur || sitelinks > cur.sitelinks || (sitelinks === cur.sitelinks && !cur.city && city)) {
    airports.set(iata, { name: r.jaLabel.value.trim(), city, sitelinks });
  }
}

const apLines = [...airports.entries()]
  .sort((a, b) => (a[0] < b[0] ? -1 : 1))
  .map(([iata, a]) => `  ${lit(iata)}: [${lit(a.name)}, ${lit(a.city)}],`);

writeFileSync(
  AIRPORT_OUT,
  `// 自動生成。手で編集しない（scripts/gen-airlines.mjs で再生成）。
// 出典: Wikidata（CC0）。IATA コードを持ち日本語名がある空港。
// [空港名, 就航都市（P931。無ければ null）]
//
// **動的 import すること。** 300KB 近くあるので初期バンドルに載せない。
export const AIRPORTS_JA: Record<string, readonly [string, string | null]> = {
${apLines.join("\n")}
};
`,
);

console.log(`gen-airlines: ${airports.size} 空港の日本語名を書き出した`);
