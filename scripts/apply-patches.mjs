// root の postinstall。patches/ のパッチを node_modules に当てる。
//
// patch-package を bin 名（PATH 経由）で直に呼ぶと、環境によっては解決できず
// `sh: patch-package: command not found` / exit 127 で `npm install` ごと落ちる。
// Vercel のデプロイが実際にこれで止まった。ここでは PATH に頼らず
// require.resolve でパッケージ内の実体を探し、node で直接起動する。
//
// patches/ が要るのはネイティブ（iOS/Android）ビルドだけで、web のデプロイには
// 無関係。なので patch-package 自体が入っていない環境では警告だけ出して素通り
// する（web のデプロイをネイティブ都合で落とさない）。パッチが当たらないまま
// iOS をビルドすれば Swift のコンパイルエラーで確実に気付ける。
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let cli;
try {
  cli = require.resolve("patch-package/index.js");
} catch {
  console.warn(
    "[postinstall] patch-package が見つからないので patches/ の適用をスキップします" +
      "（ネイティブビルドには必要。web のデプロイには不要）",
  );
  process.exit(0);
}

const result = spawnSync(process.execPath, [cli], { stdio: "inherit" });
process.exit(result.status ?? 1);
