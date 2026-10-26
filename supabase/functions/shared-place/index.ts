// Google マップの「共有」→ triplot の共有画面（iOS の拡張機能）から、web の
// /api/shared-place へ取り次ぐ中継。**役割は宛先と鍵を預かることだけ。**
//
// 判断（場所を引く・旅行に足す）は web の API と @triplot/shared が持つ。ここに
// 持たせると Deno 側に二重実装ができ、vitest のテストも届かなくなる
// （flight-lookup と同じ考え方）。
//
// なぜ中継が要るか: staging の web には Vercel の保護がかかっていて、外から
// 呼ぶには保護を越える鍵（x-vercel-protection-bypass）が要る。アプリに鍵を
// 持たせると、配布した ipa から抜かれる。ここに置けば鍵はサーバーの外に出ない。
// 宛先も、アプリが向いている Supabase（本番 / staging）で自然に分かれる。
//
// 宛先は固定（/api/shared-place）。メソッド・クエリ・本文・ログイン中の人の
// トークンだけをそのまま渡す。
//
// 環境変数（supabase secrets）:
//   SHARED_PLACE_WEB_URL  例: https://triplot.app（本番）/ staging の Vercel の URL
//   VERCEL_BYPASS         staging だけ。Vercel の Protection Bypass for Automation の値

Deno.serve(async (req) => {
  const base = Deno.env.get("SHARED_PLACE_WEB_URL");
  if (!base) {
    return Response.json({ error: "not configured" }, { status: 503 });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  const target = new URL("/api/shared-place", base);
  target.search = new URL(req.url).search;

  const headers = new Headers();
  const authorization = req.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const bypass = Deno.env.get("VERCEL_BYPASS");
  if (bypass) headers.set("x-vercel-protection-bypass", bypass);

  const res = await fetch(target, {
    method: req.method,
    headers,
    body: req.method === "POST" ? await req.text() : undefined,
  });
  return new Response(res.body, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/json",
    },
  });
});
