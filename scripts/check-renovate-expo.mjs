#!/usr/bin/env node
// Renovate に触らせない「Expo の SDK が版を決めている依存」の一覧が、実際の依存と
// 合っているかを確かめる（docs/development.md「依存の更新」）。
//
// Expo の部品は Expo が SDK ごとに動作を確かめた版の組み合わせ（expo の
// bundledNativeModules.json）で揃える必要があり、Renovate はその組み合わせを
// 知らない。アプリに Expo の部品を足した時に除外を書き忘れると、Renovate が
// 組み合わせを崩す PR を出し、しかもそれは自動マージの対象になる。書き忘れは
// 画面で気付けないので、ここで止める。
//
//   npm run check:renovate-expo             # 一致を確かめる
//   npm run check:renovate-expo -- --print  # 書くべき一覧を出す

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));

const bundled = read("node_modules/expo/bundledNativeModules.json");
const deps = new Set();
for (const f of [
  "package.json",
  "apps/web/package.json",
  "apps/mobile/package.json",
  "packages/shared/package.json",
]) {
  const p = read(f);
  for (const n of Object.keys({ ...p.dependencies, ...p.devDependencies })) deps.add(n);
}
const expected = [...deps].filter((n) => n in bundled).concat("expo").sort();

if (process.argv.includes("--print")) {
  console.log(JSON.stringify(expected, null, 2));
  process.exit(0);
}

// ファイルを限らない enabled: false の規則が、Expo の部品を外している規則（1つだけ）。
// apps/mobile に限った規則（Expo の relatedPackages）は別に持っている。
const rules = (read("renovate.json").packageRules ?? []).filter(
  (r) => r.enabled === false && !r.matchFileNames,
);
if (rules.length !== 1) {
  console.error("check-renovate-expo: renovate.json にファイルを限らない enabled: false の規則がちょうど1つ無い");
  process.exit(1);
}
const listed = [...(rules[0].matchPackageNames ?? [])].sort();

const missing = expected.filter((n) => !listed.includes(n));
const extra = listed.filter((n) => !expected.includes(n));
if (missing.length || extra.length) {
  console.error("check-renovate-expo: Renovate の除外と Expo の SDK が決める依存がずれている");
  if (missing.length) console.error(`  除外に足す: ${missing.join(", ")}`);
  if (extra.length) console.error(`  除外から外す: ${extra.join(", ")}`);
  console.error("  書くべき一覧: npm run check:renovate-expo -- --print");
  process.exit(1);
}
console.log(`check-renovate-expo: OK（${expected.length} 個）`);
