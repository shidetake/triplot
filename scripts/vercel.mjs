// Vercel CLI を手元から使うための入口。`npm run vercel -- <サブコマンド>`。
//
// **`vercel login` に頼らない。** ブラウザでのログインはアカウント全体に効く
// トークンを Mac に保存する。チームだけに絞った期限付きのトークン
// （apps/web/.env.local の VERCEL_TOKEN）を環境変数で渡す。引数には載せない
// （npm 12 は npx の引数を画面に出す。docs/development.md の「Supabase の管理用トークン」）。
//
// CLI は全体に入れたもの（`npm i -g vercel`）を呼ぶ。チームはいつも hdtks-projects。

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const ENV_FILE = path.join(ROOT, "apps/web/.env.local");
const SCOPE = "hdtks-projects";

const m = fs.existsSync(ENV_FILE)
  ? fs.readFileSync(ENV_FILE, "utf8").match(/^VERCEL_TOKEN=(.*)$/m)
  : null;
const token = m?.[1]?.trim();
if (!token) {
  console.error(
    "apps/web/.env.local に VERCEL_TOKEN がありません（docs/development.md の「Vercel の CLI」）",
  );
  process.exit(1);
}

const r = spawnSync("vercel", [...process.argv.slice(2), "--scope", SCOPE], {
  env: { ...process.env, VERCEL_TOKEN: token },
  stdio: "inherit",
});
if (r.error) {
  console.error(
    r.error.code === "ENOENT"
      ? "vercel が見つかりません（npm i -g vercel）"
      : r.error.message,
  );
  process.exit(1);
}
process.exit(r.status ?? 1);
