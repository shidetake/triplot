// Cloudflare Cron Worker: 抽出失敗の自動リトライを駆動する「心拍」。
// 毎分 Next.js の /api/cron/retry-extract を叩くだけ（状態は持たない・叩くだけ）。
// inbound-email Worker とは別 Worker にしている: 無関係な関心事で、状態は Supabase が
// 持ち、リトライ処理は Vercel アプリ側にある。共有 in-process 状態がゼロ＝同居の利点なし。
// 秘密も別（こちらは CRON_SECRET だけ）なので最小権限の意味でも分離。
//
// 本番と staging の両方を叩く（staging の取り込みも本番と同じ流れで確かめるため）。
//
// 必要な環境変数（Cloudflare の Worker 設定 → Variables and Secrets で登録）:
//   RETRY_ENDPOINT_URL          例: https://triplot.app/api/cron/retry-extract
//   CRON_SECRET                 Vercel の同名 env（Production）と同じ値（Bearer 認証）
//   STAGING_RETRY_ENDPOINT_URL  例: https://triplot-git-staging-hdtks-projects.vercel.app/api/cron/retry-extract
//   STAGING_CRON_SECRET         Vercel の CRON_SECRET（Preview）と同じ値
//   STAGING_VERCEL_BYPASS       Vercel の Protection Bypass for Automation の値
// staging の URL が無ければ staging は叩かない。
//
// Cron Trigger: "* * * * *"（毎分）。
// デプロイ: 現状は Cloudflare ダッシュボードにこの内容を貼って作成し、Triggers で
// cron を設定、Variables に上記を登録する（このファイルが原本）。

function beat(url, headers, label) {
  return fetch(url, { headers }).catch((err) =>
    console.log("retry-extract trigger failed", label, err),
  );
}

const handler = {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      beat(
        env.RETRY_ENDPOINT_URL,
        { authorization: `Bearer ${env.CRON_SECRET}` },
        "production",
      ),
    );
    if (env.STAGING_RETRY_ENDPOINT_URL && env.STAGING_CRON_SECRET) {
      const headers = { authorization: `Bearer ${env.STAGING_CRON_SECRET}` };
      if (env.STAGING_VERCEL_BYPASS) {
        headers["x-vercel-protection-bypass"] = env.STAGING_VERCEL_BYPASS;
      }
      ctx.waitUntil(
        beat(env.STAGING_RETRY_ENDPOINT_URL, headers, "staging"),
      );
    }
  },
};

export default handler;
