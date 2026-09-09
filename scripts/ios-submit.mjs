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

import { verifyIpa } from "./ios-verify-ipa.mjs";

const args = process.argv.slice(2);
const KNOWN = ["--force", "--check-only"];
// **知らないフラグは黙って無視しない。** 綴りを外した時に、検証だけのつもりが
// 本当に submit されてしまう（実際にやった）。
const unknown = args.filter((a) => a.startsWith("--") && !KNOWN.includes(a));
if (unknown.length > 0) {
  console.error(`知らないフラグ: ${unknown.join(" ")}`);
  console.error(`使えるのは ${KNOWN.join(" / ")}`);
  process.exit(1);
}
const force = args.includes("--force");
const checkOnly = args.includes("--check-only");
const ipa = args.find((a) => !a.startsWith("--"));

if (!ipa) {
  console.error(
    "使い方: npm run ios:submit -- <path-to-ipa> [--check-only] [--force]",
  );
  process.exit(1);
}
if (!fs.existsSync(ipa)) {
  console.error(`ipa が見つからない: ${ipa}`);
  process.exit(1);
}

const ok = verifyIpa(ipa);
if (checkOnly) process.exit(ok ? 0 : 1);
if (!ok && !force) process.exit(1);
if (!ok) console.error("--force が付いているので続行する。");

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
