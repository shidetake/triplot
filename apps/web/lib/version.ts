// デプロイ反映の目視確認用（管理者のアカウントメニューにだけ出す）と、
// フィードバックに添える版。どの環境も Vercel が注入するコミットハッシュ
// （先頭7桁）。手で上げる番号は持たない（上げ忘れると区別が付かなくなる）。

export function getVersion(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (!sha) return "dev";
  return sha.slice(0, 7);
}

export function getDeployEnv(): string {
  return process.env.VERCEL_ENV ?? "local";
}
