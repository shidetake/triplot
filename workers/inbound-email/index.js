// Cloudflare Email Worker: triplot.app 宛のメールを受けて、Next.js の
// /api/inbound-email へ POST で転送する。Email Routing の catch-all ルールの
// アクションをこの Worker に向けて使う。
//
// 必要な環境変数（Cloudflare の Worker 設定 → Variables で登録）:
//   INBOUND_ENDPOINT_URL  例: https://triplot.app/api/inbound-email
//   INBOUND_EMAIL_SECRET  Vercel の同名 env と同じ値（共有シークレット）
//
// デプロイ: 現状は Cloudflare ダッシュボードにこの内容を貼って作成している。
// （リポジトリのこのファイルが原本。将来 wrangler 管理に移す）
//
// M2: 生メール(MIME)全文も送り、サーバ側で inbound_emails に保存する。

const handler = {
  async email(message, env) {
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

    try {
      await fetch(env.INBOUND_ENDPOINT_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-inbound-secret": env.INBOUND_EMAIL_SECRET,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.log("inbound-email POST failed", err);
    }

    // 開発中、取りこぼし防止に Gmail へも転送したい場合は次行を有効化:
    // await message.forward("あなたのGmail@gmail.com");
  },
};

export default handler;
