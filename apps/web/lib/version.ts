// デプロイ反映の目視確認用。
// 本番(production)だけはセマンティックバージョン（scripts/gen-web-version.mjs
// で生成・コミットする version.generated.ts が単一の真実。リリース手順は
// そのスクリプト本体のコメント参照）。それ以外（preview・ローカル）は
// Vercel が注入するコミットハッシュを表示する（プレビューは頻繁に変わり
// バージョン番号を割り当てる意味が無いため）。

import { RELEASE_VERSION } from "./version.generated";

export function getVersion(): string {
  if (process.env.VERCEL_ENV === "production") return RELEASE_VERSION;
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (!sha) return "dev";
  return sha.slice(0, 7);
}

export function getDeployEnv(): string {
  return process.env.VERCEL_ENV ?? "local";
}
