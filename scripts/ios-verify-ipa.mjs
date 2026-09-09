// ipa の中身を検める。ビルド直後（ios-build）と submit の前（ios-submit）の
// 両方から呼ぶ。**同じ判定を2箇所に書かない**ためにここに置く。
//
// 見るのは1点、「起動に要るフレームワークが入っているか」。上流の
// アーティファクト配信が落ちていると React Native がソースからビルドされ、
// **ビルドは成功するのに React.framework と ReactNativeDependencies.framework が
// 同梱されない**。ログにも成果物の名前にも異常が出ないので、起動するまで
// 分からない。実際に 0.1.0 (210) を TestFlight まで出してしまった（2026-09-10）。

import { spawnSync } from "node:child_process";

// 欠けたら起動しないもの。Expo 系は欠けても起動はするのでここでは見ない
// （「起動しない＝出す意味が無い」の線で引く）。
export const REQUIRED_FRAMEWORKS = [
  "React.framework",
  "ReactNativeDependencies.framework",
  "hermesvm.framework",
];

/** 問題なければ true。欠けていれば理由を出して false。 */
export function verifyIpa(ipa) {
  const listed = spawnSync("unzip", ["-l", ipa], {
    encoding: "utf8",
    maxBuffer: 64_000_000,
  });
  if (listed.status !== 0) {
    console.error(`ipa を読めない: ${listed.stderr || listed.status}`);
    return false;
  }
  const found = new Set(
    [...listed.stdout.matchAll(/Frameworks\/([A-Za-z0-9_]+\.framework)/g)].map(
      (m) => m[1],
    ),
  );
  const missing = REQUIRED_FRAMEWORKS.filter((f) => !found.has(f));
  console.log(`同梱フレームワーク: ${found.size} 個`);
  if (missing.length === 0) return true;

  console.error("");
  console.error(`**欠けている: ${missing.join(", ")}**`);
  console.error("");
  console.error("これが入っていないアプリは起動した瞬間に落ちる。上流の");
  console.error("アーティファクト配信が落ちていて、ソースからビルドする経路に");
  console.error("落ちた時にこうなる（AGENTS.md「pod install が cmake で落ちる時」）。");
  console.error("");
  console.error("配信が戻っているか確かめて、戻ってからビルドし直すこと。");
  console.error("回避してビルドしたものを出さない。");
  return false;
}
