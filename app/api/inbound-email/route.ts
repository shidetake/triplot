import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

// Cloudflare Email Worker からの受信メール通知を受ける webhook。
// M1c（疎通確認フェーズ）: まだ本文パース/保存はせず、メールが届いたことと
// 封筒情報（from / to / subject）をログするだけ。M2 で本文パース＋下書き保存に
// 置き換える。Worker とは共有シークレット（X-Inbound-Secret ヘッダ）で認証し、
// 第三者が偽の受信を投げ込めないようにする。

function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual は長さが違うと例外なので先に長さで弾く。
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expected = process.env.INBOUND_EMAIL_SECRET;
  if (!expected) {
    // 設定漏れ。シークレット未設定のまま誰でも投げられる状態にはしない。
    return NextResponse.json(
      { error: "inbound email not configured" },
      { status: 500 },
    );
  }

  if (!secretMatches(request.headers.get("x-inbound-secret"), expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { from, to, subject, rawSize, messageId } = body;

  // 疎通確認用ログ。Vercel の runtime logs で確認する。
  console.log(
    "[inbound-email]",
    JSON.stringify({ from, to, subject, rawSize, messageId }),
  );

  return NextResponse.json({ ok: true });
}
