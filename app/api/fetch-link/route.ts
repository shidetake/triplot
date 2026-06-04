import { lookup } from "node:dns/promises";

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAllowedReceiptHost } from "@/lib/receipt/links";
import { htmlToText } from "@/lib/receipt/text";
import { isBlockedIp } from "@/lib/receipt/ssrf";

// レシートの明細リンクを「サーバ側で」取得して本文テキストを返すプロキシ。
// クライアント（ブラウザ）は CORS で外部サイトを直接読めないのでここを経由する。
// 取得自体は HTTP GET のみ（LLM 推論ではない）ので BYOK のコスト原則に抵触しない。
//
// 安全策:
//  - ログイン済みユーザのみ（オープンプロキシにしない）
//  - https かつ許可レシートドメインのみ（主防御＝ドメイン・ホワイトリスト）
//  - 解決 IP がプライベート/ループバック/メタデータ等なら拒否（defense-in-depth）
//  - リダイレクトは手動で1ホップずつ再検証、回数制限、タイムアウト、サイズ上限

const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 8000;
const MAX_BYTES = 1_000_000; // 1MB

async function assertSafeUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("invalid url");
  }
  if (u.protocol !== "https:") throw new Error("https only");
  if (!isAllowedReceiptHost(u.hostname)) throw new Error("host not allowed");
  const addrs = await lookup(u.hostname, { all: true });
  if (addrs.length === 0) throw new Error("dns resolve failed");
  if (addrs.some((a) => isBlockedIp(a.address))) {
    throw new Error("blocked address");
  }
  return u;
}

export async function POST(request: Request) {
  // ログイン済みユーザのみ
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { url?: unknown };
  try {
    body = (await request.json()) as { url?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.url !== "string") {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  let current = body.url;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const url = await assertSafeUrl(current);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(url, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: { accept: "text/html,application/xhtml+xml" },
        });
      } finally {
        clearTimeout(timer);
      }

      // リダイレクトは次ホップで再検証
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) throw new Error("redirect without location");
        current = new URL(loc, url).toString();
        continue;
      }
      if (!res.ok) {
        return NextResponse.json(
          { error: `upstream ${res.status}` },
          { status: 502 },
        );
      }

      // サイズ上限つきで読む
      const buf = await res.arrayBuffer();
      const sliced = buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf;
      const html = new TextDecoder().decode(sliced);
      return NextResponse.json({ text: htmlToText(html) });
    }
    return NextResponse.json({ error: "too many redirects" }, { status: 502 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 400 },
    );
  }
}
