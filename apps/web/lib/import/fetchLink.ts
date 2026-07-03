import { lookup } from "node:dns/promises";

import { isAllowedReceiptHost } from "./links";
import { isBlockedIp } from "./ssrf";
import { htmlToText } from "./text";

// レシートの明細リンクを「サーバ側で」取得して本文テキストを返す（取得不可・非許可・
// SSRF 危険なら null）。抽出前の enrichment（gatherReceiptText の fetchLink）に渡す。
//
// 安全策:
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

export async function fetchReceiptLink(raw: string): Promise<string | null> {
  let current = raw;
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
        if (!loc) return null;
        current = new URL(loc, url).toString();
        continue;
      }
      if (!res.ok) return null;

      const buf = await res.arrayBuffer();
      const sliced = buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf;
      return htmlToText(new TextDecoder().decode(sliced));
    }
    return null;
  } catch {
    return null;
  }
}
