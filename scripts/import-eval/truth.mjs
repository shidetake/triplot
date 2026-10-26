// 正解（本番で利用者が確定した旅行の費用・予定）を読むだけで取り出し、
// ~/.triplot-eval/truth-<組>.json に置く。本番の旅行を直したら取り直す。
//
// 使い方: npm run eval:import:truth -- <組>

import { lit, loadSet, prodQuery, writeEval } from "./lib.mjs";

const name = process.argv[2];
if (!name) {
  console.error("使い方: npm run eval:import:truth -- <組>");
  process.exit(1);
}
const set = loadSet(name);
const T = lit(set.prodTrip);

const expenses = await prodQuery(`
  select x.id, x.local_price::float price, x.local_currency currency, x.rate_to_default::float rate,
         to_char(x.paid_at, 'YYYY-MM-DD"T"HH24:MI') paid_at, x.note, c.name category, p.name place
  from expenses x join expense_categories c on c.id = x.category_id left join places p on p.id = x.place_id
  where x.trip_id = ${T} order by x.paid_at`);
const events = await prodQuery(`
  select v.id, v.kind, v.all_day, v.title, to_char(v.start_at, 'YYYY-MM-DD"T"HH24:MI') start_at,
         to_char(v.end_at, 'YYYY-MM-DD"T"HH24:MI') end_at, v.start_tz, v.end_tz, v.note,
         sp.name start_place, ep.name end_place
  from events v left join places sp on sp.id = v.start_place_id left join places ep on ep.id = v.end_place_id
  where v.trip_id = ${T} order by v.start_at`);

const file = writeEval(`truth-${name}.json`, {
  set: name,
  takenAt: new Date().toISOString(),
  expenses,
  events,
});
console.log(`${file}: 費用 ${expenses.length} 件・予定 ${events.length} 件`);
