// デプロイ反映の目視確認用。Vercel が注入する環境変数を読む。
// ローカル開発では未定義なので "dev" を返す。

export function getVersion(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (!sha) return "dev";
  return sha.slice(0, 7);
}

export function getDeployEnv(): string {
  return process.env.VERCEL_ENV ?? "local";
}
