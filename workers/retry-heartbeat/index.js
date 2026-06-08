// Cloudflare Cron Worker: 抽出失敗の自動リトライを駆動する「心拍」。
// 毎分 Next.js の /api/cron/retry-extract を叩くだけ（状態は持たない・叩くだけ）。
// inbound-email Worker とは別 Worker にしている: 無関係な関心事で、状態は Supabase が
// 持ち、リトライ処理は Vercel アプリ側にある。共有 in-process 状態がゼロ＝同居の利点なし。
// 秘密も別（こちらは CRON_SECRET だけ）なので最小権限の意味でも分離。
//
// 必要な環境変数（Cloudflare の Worker 設定 → Variables / Secrets で登録）:
//   RETRY_ENDPOINT_URL  例: https://triplot.app/api/cron/retry-extract
//   CRON_SECRET         Vercel の同名 env と同じ値（Bearer 認証）
//
// Cron Trigger: "* * * * *"（毎分）。
// デプロイ: 現状は Cloudflare ダッシュボードにこの内容を貼って作成し、Triggers で
// cron を設定、Variables に上記を登録する（このファイルが原本）。

const handler = {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      fetch(env.RETRY_ENDPOINT_URL, {
        headers: { authorization: `Bearer ${env.CRON_SECRET}` },
      }).catch((err) => console.log("retry-extract trigger failed", err)),
    );
  },
};

export default handler;
