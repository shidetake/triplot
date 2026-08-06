// OSS ライセンス一覧（apps/mobile の「このアプリについて」画面用）を生成する。
//
//   node scripts/gen-licenses.mjs
//
// license-checker-rseidelsohn でリポジトリ全体をスキャンする（npm workspaces の
// ホイスト構造上、apps/mobile だけを起点にすると root にホイストされた依存が
// 拾えず 21 件しか出ない実測結果があったため）。web 専用パッケージも混ざるが、
// 削って過小な帰属表示になるより「多めに出す」方が安全という判断。

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url);
const OUT = new URL("../apps/mobile/src/licenses.generated.ts", import.meta.url);

const raw = execFileSync(
  "npx",
  [
    "license-checker-rseidelsohn",
    "--production",
    "--excludePrivatePackages",
    "--json",
  ],
  { cwd: ROOT, encoding: "utf8", maxBuffer: 1024 * 1024 * 50 },
);
const data = JSON.parse(raw);

const entries = Object.entries(data)
  .map(([key, info]) => {
    const at = key.lastIndexOf("@");
    const name = at > 0 ? key.slice(0, at) : key;
    const version = at > 0 ? key.slice(at + 1) : "";
    const licenses = Array.isArray(info.licenses)
      ? info.licenses.join(" OR ")
      : (info.licenses ?? "不明");
    return { name, version, license: licenses };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const body = `// 生成ファイル。手で編集しない。
// node scripts/gen-licenses.mjs で再生成する。

export type LicenseEntry = { name: string; version: string; license: string };

export const LICENSES: LicenseEntry[] = ${JSON.stringify(entries, null, 2)};
`;

writeFileSync(OUT, body);
console.log(`Wrote ${entries.length} entries to ${OUT.pathname}`);
