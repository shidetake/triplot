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
  // `cmake` が要求されたら、それは上流のアーティファクト配信が落ちている合図
  // （Hermes と React Native 本体はビルド済みの tarball を落として使うので、
  // 普段 cmake は要らない）。**その場で配信の生死を見る** —— 調べ方を文書に
  // 書いておくより、要る瞬間に自分で走らせた方が確実。
  const log = fs.readFileSync(logFile, "utf8");
  if (log.includes("Unable to locate the executable `cmake`")) {
    console.error("");
    console.error("上流のアーティファクト配信が落ちている合図。生死を見る:");
    for (const [name, url] of artifactUrls()) {
      const code = spawnSync(
        "curl",
        ["-s", "-o", "/dev/null", "-w", "%{http_code}", "-r", "0-10", url],
        { encoding: "utf8", timeout: 20_000 },
      ).stdout?.trim();
      console.error(`  ${name}: ${code ?? "?"}`);
    }
    console.error("");
    console.error("206 以外が混ざっていたら落ちている。**回避せず待つ**");
    console.error("（Hermes だけキャッシュで塞ぐと、React Native 本体は");
    console.error("ソースからビルドされ、起動しないアプリができる）。");
  }
  process.exit(1);
}

// Hermes / React Native 本体のビルド済み tarball の在り処。
function artifactUrls() {
  const base = "https://repo.reactnative.dev/maven2/com/facebook";
  const props = fs.readFileSync(
    path.join(mobile, "node_modules/react-native/sdks/hermes-engine/version.properties"),
    "utf8",
  );
  const hv = props.match(/HERMES_V1_VERSION_NAME=(.+)/)?.[1].trim();
  const rv = JSON.parse(
    fs.readFileSync(path.join(mobile, "node_modules/react-native/package.json"), "utf8"),
  ).version;
  return [
    ["hermes", `${base}/hermes/hermes-ios/${hv}/hermes-ios-${hv}-hermes-ios-release.tar.gz`],
    ...["core", "dependencies"].map((a) => [
      `rn-${a}`,
      `${base}/react/react-native-artifacts/${rv}/react-native-artifacts-${rv}-reactnative-${a}-release.tar.gz`,
    ]),
  ];
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
