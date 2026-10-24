// Renovate から外している「Expo の SDK に版が縛られている依存」を読み解く。
// check-renovate-expo.mjs（一覧の検査）と expo-sdk-notice.mjs（取り残しの知らせ）が使う。
//
// 外すのは renovate.json5 の1つの規則で、名前の一覧は次の足し引きでできている
// （docs/development.md「Expo の部品」）:
//
//   Expo の一覧（bundledNativeModules.json と expo 本体）＋ 名前（expo-* 等）＋ 足す − 引く
//
// 一覧の中では、Expo の一覧に載っている名前・名前の形（*）・それ以外の名前（＝足す）・
// 先頭が ! の名前（＝引く）として見分ける。

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import JSON5 from "json5";

export const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));

const PACKAGE_FILES = [
  "package.json",
  "apps/web/package.json",
  "apps/mobile/package.json",
  "packages/shared/package.json",
];

export function loadExpoExclusion() {
  const config = JSON5.parse(fs.readFileSync(path.join(root, "renovate.json5"), "utf8"));
  // ファイルを限らない enabled: false の規則が、Expo の部品を外している規則（1つだけ）。
  // apps/mobile に限った規則（Expo の relatedPackages）は別に持っている。
  const rules = (config.packageRules ?? []).filter((r) => r.enabled === false && !r.matchFileNames);
  if (rules.length !== 1) {
    throw new Error("renovate.json5 にファイルを限らない enabled: false の規則がちょうど1つ無い");
  }
  const bundled = readJson("node_modules/expo/bundledNativeModules.json");
  const inExpoList = (n) => n === "expo" || n in bundled;

  const entries = rules[0].matchPackageNames ?? [];
  const negated = entries.filter((e) => e.startsWith("!")).map((e) => e.slice(1));
  const positive = entries.filter((e) => !e.startsWith("!"));
  const patterns = positive.filter((e) => e.includes("*"));
  const names = positive.filter((e) => !e.includes("*"));

  const matchesPattern = (n) => patterns.some((p) => globToRegExp(p).test(n));
  return {
    inExpoList,
    expoListed: names.filter(inExpoList),
    added: names.filter((n) => !inExpoList(n)),
    patterns,
    negated,
    matchesPattern,
    // Renovate と同じ判定: 打ち消しでない項目のどれかに当たり、打ち消しのどれにも当たらない
    excludes: (n) => (names.includes(n) || matchesPattern(n)) && !negated.includes(n),
  };
}

// Renovate の名前の形（minimatch）のうち、使っている範囲だけ: * は / を跨がない
function globToRegExp(glob) {
  const body = glob
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\/]/g, "\\$&"))
    .join("[^/]*");
  return new RegExp(`^${body}$`, "i");
}

export function dependencyNames() {
  const deps = new Set();
  for (const f of PACKAGE_FILES) {
    const p = readJson(f);
    for (const n of Object.keys({ ...p.dependencies, ...p.devDependencies })) deps.add(n);
  }
  return deps;
}

// 入っている版が求める expo の版（peerDependencies.expo）。入っていなければ null
export function expoPeerRange(name) {
  for (const f of PACKAGE_FILES) {
    try {
      const require = createRequire(path.join(root, f));
      const pkg = JSON.parse(fs.readFileSync(require.resolve(`${name}/package.json`), "utf8"));
      return pkg.peerDependencies?.expo ?? null;
    } catch {
      // この package.json からは解決できない（別の workspace の依存か、exports で塞がれている）
    }
  }
  return null;
}

// 求める expo の版が SDK 1つ（メジャー1つ）に閉じているか。「57 系だけ」は SDK を上げると
// 必ず合わなくなる＝SDK に縛られている。「52 以上」「*」は縛られていない。
// 書き方は npm の範囲のうち、メジャー1つに閉じる形だけを拾う:
//   ^57 / ^57.0.1 / ~57.0 / 57 / 57.x / 57.* / >=57.0.0 <58.0.0
export function isSingleMajor(range) {
  if (!range) return false;
  const r = range.trim();
  if (r.includes("||")) return false;
  if (/^[\^~]?\s*\d+(\.(\d+|x|\*)){0,2}$/.test(r)) return true;
  const m = r.match(/^>=?\s*(\d+)(?:\.\d+){0,2}\s+<\s*(\d+)(?:\.0){0,2}$/);
  return Boolean(m && Number(m[2]) === Number(m[1]) + 1);
}
