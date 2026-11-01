// AI（MCP のクライアント）から web の /api/mcp へ取り次ぐ中継。**staging でだけ使う。**
//
// 本番の AI は web（https://triplot.app/api/mcp）を直に叩く。staging の web には
// Vercel の保護がかかっていて外の AI から届かないので、ここが保護を越える鍵
// （x-vercel-protection-bypass）を預かって取り次ぐ（shared-place と同じ考え方）。
// 判断（認可・道具）は全部 web が持ち、ここは宛先と鍵を預かるだけ。
//
// AI から見た入口はこの関数の URL になるので、staging の web の環境変数
// MCP_RESOURCE_URL にこの URL を置く（認可の情報に載せる入口がこちらになる）。
//
//   /functions/v1/mcp            → /api/mcp
//   /functions/v1/mcp/<残り>     → /api/mcp/<残り>（認可の情報 oauth-protected-resource 等）
//
// 認可の情報は鍵なしで取りに来るので、ゲートウェイの JWT の検査は切る
// （supabase/config.toml の [functions.mcp]）。鍵の検査は web 側がする。
//
// 環境変数（supabase secrets）:
//   MCP_WEB_URL    staging の Vercel の URL
//   VERCEL_BYPASS  Vercel の Protection Bypass for Automation の値

// AI と web の間でそのまま渡すヘッダー（MCP と OAuth の分）。
//
// **MCP のヘッダー（Mcp- で始まるもの）は名前で数え上げず、全部渡す。** MCP は
// 版を重ねるたびにヘッダーを足していて（新しい版は要求の種類を Mcp-Method で
// 送る）、数え上げると新しい版の AI だけが壊れる。実際に ChatGPT が
// 「action discovery failed」になった（Mcp-Method を落とし、web が要求を断った）。
const FORWARD_REQUEST = [
  "authorization",
  "content-type",
  "accept",
  "last-event-id",
];
const FORWARD_RESPONSE = [
  "content-type",
  "www-authenticate",
  "cache-control",
  "access-control-allow-origin",
  "access-control-allow-headers",
  "access-control-allow-methods",
  "access-control-expose-headers",
];

Deno.serve(async (req) => {
  const base = Deno.env.get("MCP_WEB_URL");
  if (!base) {
    return Response.json({ error: "not configured" }, { status: 503 });
  }

  const url = new URL(req.url);
  // 関数の中では /mcp/<残り> で届く（/functions/v1 はゲートウェイが外す）。
  const rest = url.pathname.replace(/^\/mcp/, "");
  const target = new URL(`/api/mcp${rest}`, base);
  target.search = url.search;

  const headers = new Headers();
  for (const name of FORWARD_REQUEST) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  for (const [name, value] of req.headers) {
    if (name.startsWith("mcp-")) headers.set(name, value);
  }
  const bypass = Deno.env.get("VERCEL_BYPASS");
  if (bypass) headers.set("x-vercel-protection-bypass", bypass);

  const hasBody = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
  const res = await fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
    redirect: "manual",
  });

  const out = new Headers();
  for (const name of FORWARD_RESPONSE) {
    const value = res.headers.get(name);
    if (value) out.set(name, value);
  }
  for (const [name, value] of res.headers) {
    if (name.startsWith("mcp-")) out.set(name, value);
  }
  // 返事は流したまま渡す（MCP は SSE で返すことがある）。
  return new Response(res.body, { status: res.status, headers: out });
});
