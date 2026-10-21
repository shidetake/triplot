// Expo の部品に今の SDK の中の更新があるか、新しい SDK が出ているかを調べ、知らせる文を
// 返す。**止めはしない。** 作業の途中で部品を変えると、確かめた結果が自分の変更と部品の
// 更新のどちらによるものか切り分けられなくなるので、上げるのは今の作業を終えた後、
// 独立した作業として行う（docs/development.md「依存の更新」）。
//
// Renovate は Expo の部品に触らない（Expo が SDK ごとに決めている版の組み合わせを
// 知らないため）。その代わりに、ビルドのたびにここで気付けるようにしている。

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

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
      lines.push("今の作業を終えてから、独立した作業として `npx expo install --fix` で揃える。");
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
    lines.push("上げるかどうか・いつ上げるかは吟味して決める。上げる時も独立した作業にする。");
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
