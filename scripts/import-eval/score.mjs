// 画面に出る値（derived-<名前>.json）を正解（truth-<組>.json）と突き合わせて採点し、
// ~/.triplot-eval/score-<名前>.json に置く。規則は docs/import-eval.md の「採点の規則」。
//
// 使い方: npm run eval:import:score -- <名前>（組は derived の中に書いてある）

import { loadSet, readEval, writeEval } from "./lib.mjs";

const norm = (s) =>
  (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]/gu, "");

// 名前の似ている度合い（0〜1）。片方がもう片方を含めば 1、それ以外は2文字ずつの重なり。
function similar(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x.includes(y) || y.includes(x)) return 1;
  const grams = (s) => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)));
  const gx = grams(x);
  const gy = grams(y);
  let common = 0;
  for (const g of gx) if (gy.has(g)) common++;
  return (2 * common) / (gx.size + gy.size || 1);
}
const minutes = (iso) => Date.parse(`${iso.length === 10 ? `${iso}T00:00` : iso.slice(0, 16)}:00Z`) / 60000;
const dayDiff = (a, b) => Math.abs(minutes(a.slice(0, 10)) - minutes(b.slice(0, 10))) / 1440;

export function score(name) {
  const derived = readEval(`derived-${name}.json`);
  const set = loadSet(derived.set);
  const truth = readEval(`truth-${set.name}.json`);
  const run = readEval(`${name}.json`);
  const excluded = (s) => set.excludedMerchants.some((r) => r.test(s ?? ""));

  // ── 費用: 同じ通貨・同じ金額で、日付の近いものを相手にする ──
  const prodExp = truth.expenses.filter((x) => !excluded(x.place ?? x.note)).map((x) => ({ ...x, used: false }));
  const exp = [];
  for (const d of derived.expenses.filter((d) => !excluded(d.label[0]))) {
    const at = d.time ? `${d.date}T${d.time}` : d.date;
    const same = prodExp.filter((x) => x.currency === d.currency && Math.abs(x.price - d.price) < 0.006);
    const cands = same
      .filter((x) => !x.used)
      .sort((a, b) => Math.abs(minutes(a.paid_at) - minutes(at)) - Math.abs(minutes(b.paid_at) - minutes(at)));
    let hit = cands[0] && (dayDiff(cands[0].paid_at, d.date) <= 2 || same.length === 1) ? cands[0] : null;
    if (!hit) {
      // 金額だけ違う（読み違い・利用者が直した）: 同じ日・同じ店・時刻が近い
      const c = prodExp.filter(
        (x) =>
          !x.used &&
          x.currency === d.currency &&
          dayDiff(x.paid_at, d.date) <= 1 &&
          similar(x.place ?? x.note, d.label[0]) >= 0.5 &&
          (!d.time || Math.abs(minutes(x.paid_at) - minutes(at)) <= 5),
      );
      if (c.length === 1) hit = c[0];
    }
    if (hit) hit.used = true;
    exp.push({ draft: d, prod: hit });
  }
  const ef = { n: 0, amount: 0, date: 0, time: 0, category: 0 };
  for (const { draft: d, prod: p } of exp.filter((r) => r.prod)) {
    ef.n++;
    if (Math.abs(p.price - d.price) < 0.006) ef.amount++;
    if (p.paid_at.slice(0, 10) === d.date) ef.date++;
    if (d.time && p.paid_at.slice(11, 16) === d.time) ef.time++;
    if (p.category === d.category) ef.category++;
  }

  // ── 予定 ──
  const prodEv = truth.events
    .filter((x) => !set.notFromEmailTitles.includes(x.title))
    .map((x) => ({ ...x, used: false }));
  // 同じメールの費用が本番の費用と対応していれば、その費用の場所にある本番の予定を相手にする
  // （カードの通知は店名が本番の場所の名前と似ないことが多い）。
  const prodExpByEmail = new Map(exp.filter((r) => r.prod).map((r) => [r.draft.emailId, r.prod]));
  const ev = [];
  // 時刻が分かっている下書きを先に対応させる（同じ予定を推定の下書きと取り合わないように）。
  const units = [...derived.events].sort((a, b) => (a.timeKnown === b.timeKnown ? 0 : a.timeKnown ? -1 : 1));
  for (const u of units) {
    let hit = null;
    for (const emailId of u.emailIds) {
      const x = prodExpByEmail.get(emailId);
      if (!x?.place) continue;
      hit =
        prodEv
          .filter((e) => !e.used && e.start_place === x.place && dayDiff(e.start_at, x.paid_at) <= 1)
          .sort((a, b) => Math.abs(minutes(a.start_at) - minutes(x.paid_at)) - Math.abs(minutes(b.start_at) - minutes(x.paid_at)))[0] ?? null;
      if (hit) break;
    }
    if (!hit) {
      // 場所・タイトルの似ている度合いと、時刻の近さ。移動かどうかは揃えない
      // （下書きはバスを移動に、本番は通常の予定にしていることがある）。
      const scored = prodEv
        .filter((e) => !e.used && dayDiff(e.start_at, u.startAt) <= 0)
        .map((e) => {
          const nameSim =
            e.start_place && u.place
              ? Math.max(similar(e.start_place, u.place), similar(e.title, u.place), similar(e.title, u.title))
              : similar(e.title, u.title);
          const near = Math.abs(minutes(e.start_at) - minutes(u.startAt)) <= 60;
          return { e, nameSim, near };
        })
        .sort((a, b) => b.nameSim + (b.near ? 0.5 : 0) - (a.nameSim + (a.near ? 0.5 : 0)));
      const top = scored[0];
      if (top && (top.nameSim >= 0.5 || (top.near && u.kind === "transit"))) hit = top.e;
    }
    if (hit) hit.used = true;
    ev.push({ draft: u, prod: hit });
  }
  const vf = { n: 0, start: 0, end: 0 };
  for (const { draft: u, prod: p } of ev.filter((r) => r.prod)) {
    vf.n++;
    if (p.start_at === u.startAt.slice(0, 16)) vf.start++;
    if (u.endAt && (p.end_at ?? "") === u.endAt.slice(0, 16)) vf.end++;
  }

  const calls = run.emails.flatMap((e) => e.calls);
  const result = {
    name,
    set: set.name,
    models: [...new Set(calls.map((c) => c.model))],
    cost: calls.reduce((s, c) => s + Number(c.cost ?? 0), 0),
    emails: run.emails.length,
    merged: run.emails.filter((e) => e.status === "merged").length,
    expenses: {
      truth: prodExp.length,
      drafts: exp.length,
      matched: exp.filter((r) => r.prod).length,
      extra: exp.filter((r) => !r.prod).map((r) => r.draft),
      missed: prodExp.filter((x) => !x.used),
      fields: ef,
    },
    events: {
      truth: prodEv.length,
      drafts: ev.length,
      matched: ev.filter((r) => r.prod).length,
      extra: ev.filter((r) => !r.prod).map((r) => r.draft),
      missed: prodEv.filter((x) => !x.used),
      fields: vf,
    },
    pairs: { expenses: exp, events: ev },
  };
  writeEval(`score-${name}.json`, result);
  return result;
}

export function summary(r) {
  const e = r.expenses;
  const v = r.events;
  return [
    `## ${r.name}（${r.models.join(", ")}）費用 $${r.cost.toFixed(3)}（1通 $${(r.cost / r.emails).toFixed(4)}）・合体 ${r.merged} 回`,
    `費用: 対応 ${e.matched}/${e.truth}・出し過ぎ ${e.extra.length}・取りこぼし ${e.missed.length}` +
      `（金額 ${e.fields.amount}・日付 ${e.fields.date}・時刻 ${e.fields.time}・カテゴリ ${e.fields.category} / ${e.fields.n}）`,
    `予定: 対応 ${v.matched}/${v.truth}・出し過ぎ ${v.extra.length}・取りこぼし ${v.missed.length}` +
      `（開始 ${v.fields.start}・終了 ${v.fields.end} / ${v.fields.n}）`,
  ].join("\n");
}

if (import.meta.main) {
  const name = process.argv[2];
  if (!name) {
    console.error("使い方: npm run eval:import:score -- <名前>");
    process.exit(1);
  }
  console.log(summary(score(name)));
}
