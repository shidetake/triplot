// フライト照会の中継。**役割はキーを預かることだけ。**
//
// 解析・予測・呼び出し順の判断は packages/shared（flight.ts /
// flightAeroDataBox.ts / flightLookup.ts）が持つ。ここに持たせると Deno 側に
// 二重実装ができ、vitest のテストも届かなくなる。だから上流の応答をそのまま
// 返す。
//
// なぜ中継が要るか: RapidAPI のキーは Google Maps のキーと違って利用元
// （bundle ID・リファラ）で縛れない。クライアントに置くと抜かれて枠を焼かれる。
//
// 受け口は「パス」ではなく**構造化した種別**にしてある。パスを受け取って
// 検証する形にすると、書き漏らしがそのまま任意のエンドポイントへの踏み台に
// なる。ここで組み立てれば、そもそも他所へは飛ばせない。

import { createClient } from "jsr:@supabase/supabase-js@2";

const UPSTREAM = "https://aerodatabox.p.rapidapi.com";
const UPSTREAM_HOST = "aerodatabox.p.rapidapi.com";

// 便名は英数字のみ（parseFlightNumber が正規化した形が来る前提だが、
// 中継側でも独立に検証する）。
const NUMBER_RE = /^[A-Z0-9]{3,8}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Request_ =
  | { kind: "flight"; number: string; date: string }
  | { kind: "dates"; number: string };

/**
 * キャッシュの寿命。
 * 便の時刻表は日単位でしか動かないので長めに取る。運航日一覧はさらに動かない。
 */
const TTL_SECONDS: Record<Request_["kind"], number> = {
  flight: 24 * 60 * 60,
  dates: 7 * 24 * 60 * 60,
};

function upstreamPath(req: Request_): string {
  return req.kind === "flight"
    ? `/flights/number/${req.number}/${req.date}`
    : `/flights/number/${req.number}/dates`;
}

function cacheKey(req: Request_): string {
  return req.kind === "flight"
    ? `flight:${req.number}:${req.date}`
    : `dates:${req.number}`;
}

function parseBody(body: unknown): Request_ | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const number = typeof b.number === "string" ? b.number.toUpperCase() : "";
  if (!NUMBER_RE.test(number)) return null;

  if (b.kind === "dates") return { kind: "dates", number };
  if (b.kind === "flight") {
    const date = typeof b.date === "string" ? b.date : "";
    if (!DATE_RE.test(date)) return null;
    return { kind: "flight", number, date };
  }
  return null;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (httpReq) => {
  if (httpReq.method !== "POST") return json({ error: "method not allowed" }, 405);

  const apiKey = Deno.env.get("AERODATABOX_API_KEY");
  if (!apiKey) return json({ error: "flight lookup is not configured" }, 503);

  let body: unknown;
  try {
    body = await httpReq.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const req = parseBody(body);
  if (!req) return json({ error: "invalid request" }, 400);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    // service_role で入る。flight_api_cache は RLS でポリシーが無く、
    // service_role だけが読み書きできる。
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const key = cacheKey(req);
  const { data: cached } = await sb
    .from("flight_api_cache")
    .select("payload, fetched_at")
    .eq("cache_key", key)
    .maybeSingle();

  if (cached) {
    const ageSec = (Date.now() - new Date(cached.fetched_at).getTime()) / 1000;
    if (ageSec < TTL_SECONDS[req.kind]) {
      return json({ payload: cached.payload, cached: true });
    }
  }

  const res = await fetch(`${UPSTREAM}${upstreamPath(req)}`, {
    headers: { "x-rapidapi-host": UPSTREAM_HOST, "x-rapidapi-key": apiKey },
  });

  // 204 = その日は運航していない。エラーではないので空配列として扱う
  // （呼び出し側が「予測にまわす」判断をする）。
  if (res.status === 204) {
    await store(sb, key, []);
    return json({ payload: [], cached: false });
  }

  if (!res.ok) {
    // 枠切れ(429)や範囲外(400)はそのまま伝える。キャッシュはしない。
    const text = await res.text();
    return json({ error: "upstream error", status: res.status, detail: text }, 502);
  }

  const payload = await res.json();
  await store(sb, key, payload);
  return json({ payload, cached: false });
});

async function store(
  sb: ReturnType<typeof createClient>,
  key: string,
  payload: unknown,
): Promise<void> {
  await sb
    .from("flight_api_cache")
    .upsert(
      { cache_key: key, payload, fetched_at: new Date().toISOString() },
      { onConflict: "cache_key" },
    );
}
