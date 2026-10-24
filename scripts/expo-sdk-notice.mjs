// Expo の部品に今の SDK の中の更新があるか、新しい SDK が出ているかを調べ、知らせる文を
// 返す。**止めはしない。** 上げる時は今の作業とは別の PR にする（自分の変更と部品の更新を
// 1つのコミットに混ぜない。docs/development.md「依存の更新」）。
//
// Renovate は Expo の部品の PR を作らない（Expo が SDK ごとに決めている版の組み合わせを
// 知らないため）。ここで比べるのは Expo のサーバーが持つ最新の組み合わせで、入っている
// expo 本体の一覧との一致は CI（check:expo-deps）が見る。

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { dependencyNames, loadExpoExclusion } from "./renovate-expo.mjs";

export function expoSdkNotice(mobileDir) {
  const lines = [];

  const check = spawnSync("npx", ["expo", "install", "--check"], {
    cwd: mobileDir,
    encoding: "utf8",
    timeout: 120_000,
  });
  if (check.status !== 0) {
    const outdated = `${check.stdout ?? ""}${check.stderr ?? ""}`
      .split("\n")
      .filter((l) => l.includes("expected version"))
      .map((l) => `  ${l.trim()}`);
    if (outdated.length > 0) {
      lines.push("Expo の部品に、今の SDK の中の更新がある:", ...outdated);
      lines.push("週1回のワークフロー（.github/workflows/expo-sdk-patch.yml）が PR にする。急ぐなら Actions から手で動かす。");
    } else {
      lines.push("Expo の部品が SDK の組み合わせどおりか確かめられなかった（`npx expo install --check`）。");
    }
  }

  const installed = installedExpoMajor(mobileDir);
  const latest = spawnSync("npm", ["view", "expo", "version"], {
    encoding: "utf8",
    timeout: 60_000,
  }).stdout?.trim();
  const latestMajor = Number(latest?.split(".")[0]);
  if (installed && latestMajor > installed) {
    if (lines.length > 0) lines.push("");
    lines.push(`新しい Expo SDK ${latestMajor} が出ている（今は ${installed}）。`);
    lines.push("上げるかどうか・いつ上げるかは吟味して決める。上げる時も今の作業とは別の PR にする。");
  }

  // Renovate から外していて、Expo のコマンドも揃えない部品（名前の形・「足す」で外したもの）。
  // 誰も新しいメジャーを持ってこないので、SDK を上げる時に一緒に見るためにここで出す。
  const stranded = strandedMajors(mobileDir);
  if (stranded.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("Renovate から外していて Expo のコマンドも揃えない部品に、新しいメジャーがある:");
    lines.push(...stranded.map((s) => `  ${s}`));
    lines.push("SDK に縛られているなら、SDK を上げる時に一緒に上げる。縛られていないなら renovate.json5 の「引く」に書く。");
  }

  if (lines.length === 0) return null;
  return ["", "── Expo の知らせ（docs/development.md「依存の更新」）──", ...lines].join("\n");
}

function installedExpoMajor(mobileDir) {
  try {
    const require = createRequire(path.resolve(mobileDir, "package.json"));
    const pkg = JSON.parse(fs.readFileSync(require.resolve("expo/package.json"), "utf8"));
    return Number(pkg.version.split(".")[0]);
  } catch {
    return null;
  }
}

function strandedMajors(mobileDir) {
  let ex;
  try {
    ex = loadExpoExclusion();
  } catch {
    return [];
  }
  const require = createRequire(path.resolve(mobileDir, "package.json"));
  const found = [];
  for (const name of dependencyNames()) {
    if (!ex.excludes(name) || ex.inExpoList(name)) continue;
    let installed;
    try {
      installed = JSON.parse(fs.readFileSync(require.resolve(`${name}/package.json`), "utf8")).version;
    } catch {
      continue;
    }
    const latest = spawnSync("npm", ["view", name, "version"], {
      encoding: "utf8",
      timeout: 60_000,
    }).stdout?.trim();
    if (latest && Number(latest.split(".")[0]) > Number(installed.split(".")[0])) {
      found.push(`${name}: ${latest}（今は ${installed}）`);
    }
  }
  return found;
}
