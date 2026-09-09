#!/usr/bin/env node
// TestFlight / App Store Connect への submit。**中身を検めてから出す。**
//
// 検めるのは1点、「入っているべきフレームワークが入っているか」。
//
// iOS の Hermes と React Native 本体はビルド済みの tarball を落として使う。
// 上流の配信が落ちるとソースからビルドする経路に落ちるが、**ビルドは成功する**
// のに React.framework / ReactNativeDependencies.framework が同梱されず、
// 起動した瞬間に落ちるアプリができる。実際に 0.1.0 (210) を TestFlight まで
// 出してしまった（2026-09-10）。ビルドのログにも成果物の名前にも異常は出ず、
// 起動しないと分からない。
//
// **この確認を submit と別の手順にしない。** 別立てにすると、思い出した時
// だけ実行される＝忘れた時に素通りする。出す操作そのものに埋めておけば、
// 出そうとした時に必ず通る。
//
//   npm run ios:submit -- apps/mobile/build-<timestamp>.ipa
//
// どうしても出したい時は --force（理由が説明できる時だけ）。

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// 欠けたら起動しないもの。Expo 系のフレームワークは欠けても起動はするので
// ここでは見ない（起動しない＝TestFlight に出す意味が無い、の線で引く）。
const REQUIRED = [
  "React.framework",
  "ReactNativeDependencies.framework",
  "hermesvm.framework",
];

const args = process.argv.slice(2);
const force = args.includes("--force");
const ipa = args.find((a) => !a.startsWith("--"));

if (!ipa) {
  console.error("使い方: npm run ios:submit -- <path-to-ipa> [--force]");
  process.exit(1);
}
if (!fs.existsSync(ipa)) {
  console.error(`ipa が見つからない: ${ipa}`);
  process.exit(1);
}

// unzip -l の一覧からフレームワーク名を拾う（展開しない）。
const listed = spawnSync("unzip", ["-l", ipa], { encoding: "utf8" });
if (listed.status !== 0) {
  console.error(`ipa を読めない: ${listed.stderr || listed.status}`);
  process.exit(1);
}
const found = new Set(
  [...listed.stdout.matchAll(/Frameworks\/([A-Za-z0-9_]+\.framework)/g)].map(
    (m) => m[1],
  ),
);
const missing = REQUIRED.filter((f) => !found.has(f));

console.log(`同梱フレームワーク: ${found.size} 個`);
if (missing.length > 0) {
  console.error("");
  console.error(`**欠けている: ${missing.join(", ")}**`);
  console.error("");
  console.error("これが入っていないアプリは起動した瞬間に落ちる。上流の");
  console.error("アーティファクト配信が落ちていて、ソースからビルドする経路に");
  console.error("落ちた時にこうなる（AGENTS.md「pod install が cmake で落ちる時」）。");
  console.error("");
  console.error("配信が戻っているか確かめて、戻ってからビルドし直すこと。");
  console.error("回避してビルドしたものを出さない。");
  if (!force) process.exit(1);
  console.error("--force が付いているので続行する。");
}

const submit = spawnSync(
  "npx",
  [
    "eas-cli",
    "submit",
    "--platform",
    "ios",
    "--path",
    path.resolve(ipa),
    "--non-interactive",
  ],
  { cwd: path.join(process.cwd(), "apps/mobile"), stdio: "inherit" },
);
process.exit(submit.status ?? 1);
