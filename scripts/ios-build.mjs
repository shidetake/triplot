#!/usr/bin/env node
// iOS のローカルビルド。**ログを必ず残し、できた ipa をその場で検める。**
//
// 直に eas-cli を叩くと2つ踏みやすい:
//
//   1. 出力を `| tail` に通してしまい、失敗の本文が捨てられて成功に見える。
//      実際にそれで失敗を1度見落とした（2026-09-10）。ここでは常にファイルへ
//      全文を落とす。
//   2. 上流のアーティファクト配信が落ちていると、React Native がソースから
//      ビルドされ、**ビルドは成功するのに React.framework が同梱されない**。
//      起動した瞬間に落ちるアプリができる。ビルド直後にここで気付く。
//
//   npm run ios:build              # production（TestFlight 用）
//   npm run ios:build -- preview   # preview（実機の軽い確認用）

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { verifyIpa } from "./ios-verify-ipa.mjs";

const profile = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "production";
const mobile = path.join(process.cwd(), "apps/mobile");
const logDir = path.join(mobile, "build-logs");
fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(
  logDir,
  `${profile}-${new Date().toISOString().replace(/[:.]/g, "-")}.log`,
);

console.log(`プロファイル: ${profile}`);
console.log(`ログ: ${logFile}`);

const before = new Set(listIpas());
const out = fs.openSync(logFile, "w");
const build = spawnSync(
  "npx",
  [
    "eas-cli",
    "build",
    "--platform",
    "ios",
    "--profile",
    profile,
    "--local",
    "--non-interactive",
  ],
  { cwd: mobile, stdio: ["ignore", out, out] },
);
fs.closeSync(out);

function listIpas() {
  return fs
    .readdirSync(mobile)
    .filter((f) => f.endsWith(".ipa"))
    .map((f) => path.join(mobile, f));
}

if (build.status !== 0) {
  console.error("");
  console.error(`ビルドが失敗した（終了コード ${build.status}）。`);
  console.error(`原因はログの全文にある: ${logFile}`);
  console.error("");
  console.error("`Unable to locate the executable cmake` が出ていたら、上流の");
  console.error("アーティファクト配信が落ちている合図。回避せず待つ");
  console.error("（AGENTS.md「pod install が cmake で落ちる時」）。");
  process.exit(1);
}

const made = listIpas().filter((f) => !before.has(f));
const ipa = made.sort(
  (a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs,
)[0];
if (!ipa) {
  console.error(`ビルドは通ったのに ipa が見つからない。ログ: ${logFile}`);
  process.exit(1);
}

console.log("");
console.log(`できた: ${path.relative(process.cwd(), ipa)}`);
if (!verifyIpa(ipa)) process.exit(1);
console.log("");
console.log("submit する:");
console.log(`  npm run ios:submit -- ${path.relative(process.cwd(), ipa)}`);
