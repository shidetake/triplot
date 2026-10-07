// Cloudflare Email Worker: triplot.app 宛のメールを受けて、Next.js の
// /api/inbound-email へ POST で転送する。Email Routing の catch-all ルールの
// アクションをこの Worker に向けて使う。
//
// 宛先のローカルパートで本番と staging に振り分ける。`receipts-staging+<token>@`
// は staging（Vercel Preview の staging ブランチ）へ、それ以外は本番へ。接頭辞は
// packages/shared/src/importAddress.ts の STAGING_IMPORT_LOCALPART と揃える。
//
// 必要な環境変数（Cloudflare の Worker 設定 → Variables and Secrets で登録）:
//   INBOUND_ENDPOINT_URL          例: https://triplot.app/api/inbound-email
//   INBOUND_EMAIL_SECRET          Vercel の同名 env（Production）と同じ値
//   STAGING_INBOUND_ENDPOINT_URL  例: https://triplot-git-staging-hdtks-projects.vercel.app/api/inbound-email
//   STAGING_INBOUND_EMAIL_SECRET  Vercel の INBOUND_EMAIL_SECRET（Preview）と同じ値
//   STAGING_VERCEL_BYPASS         Vercel の Protection Bypass for Automation の値
//                                 （Preview は Vercel Authentication で守られているため）
// staging の3つが無ければ、staging 宛のメールは捨てる（本番には流さない）。
//
// デプロイ: 現状は Cloudflare ダッシュボードにこの内容を貼って作成している。
// （リポジトリのこのファイルが原本。将来 wrangler 管理に移す）

const STAGING_PREFIX = "receipts-staging+";

function isStagingRecipient(to) {
  return to.trim().toLowerCase().startsWith(STAGING_PREFIX);
}

const handler = {
  async email(message, env) {
    const staging = isStagingRecipient(message.to);
    if (
      staging &&
      !(env.STAGING_INBOUND_ENDPOINT_URL && env.STAGING_INBOUND_EMAIL_SECRET)
    ) {
      console.log("inbound-email: staging endpoint not configured; dropped");
      return;
    }

    // message.raw は ReadableStream。全文をテキストとして読む（レシートは小さい）。
    const raw = await new Response(message.raw).text();

    const payload = {
      from: message.from,
      to: message.to,
      subject: message.headers.get("subject") || "",
      rawSize: message.rawSize,
      messageId: message.headers.get("message-id") || "",
      raw,
    };

    const headers = {
      "content-type": "application/json",
      "x-inbound-secret": staging
        ? env.STAGING_INBOUND_EMAIL_SECRET
        : env.INBOUND_EMAIL_SECRET,
    };
    if (staging && env.STAGING_VERCEL_BYPASS) {
      headers["x-vercel-protection-bypass"] = env.STAGING_VERCEL_BYPASS;
    }

    try {
      const res = await fetch(
        staging ? env.STAGING_INBOUND_ENDPOINT_URL : env.INBOUND_ENDPOINT_URL,
        { method: "POST", headers, body: JSON.stringify(payload) },
      );
      if (!res.ok) {
        console.log("inbound-email POST rejected", staging, res.status);
      }
    } catch (err) {
      console.log("inbound-email POST failed", staging, err);
    }
  },
};

export default handler;
