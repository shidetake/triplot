import { timingSafeEqual } from "node:crypto";

import { after, NextResponse } from "next/server";

import { parseImportToken } from "@/lib/receipt/inboundAddress";
import { extractInBackground } from "@/lib/receipt/process";
import { createServiceClient } from "@/lib/supabase/service";

// Cloudflare Email Worker からの受信メール通知を受ける webhook。生メール(MIME)を
// inbound_emails に保存し、本人が特定できればレスポンス後にバックグラウンド抽出する。
// Worker とは共有シークレット（X-Inbound-Secret ヘッダ）で認証し、第三者が偽の受信を
// 投げ込めないようにする。

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

  const from = typeof body.from === "string" ? body.from : null;
  const to = typeof body.to === "string" ? body.to : null;
  const raw = typeof body.raw === "string" ? body.raw : null;
  if (!from || !to || !raw) {
    return NextResponse.json(
      { error: "missing from / to / raw" },
      { status: 400 },
    );
  }

  const subject = typeof body.subject === "string" ? body.subject : null;
  const messageId =
    typeof body.messageId === "string" ? body.messageId : null;
  const size = typeof body.rawSize === "number" ? body.rawSize : raw.length;

  const supabase = createServiceClient();

  // 宛先トークンから本人を特定（From に依存しない）。不明なら user_id = null。
  let userId: string | null = null;
  const token = parseImportToken(to);
  if (token) {
    const { data: u } = await supabase
      .from("users")
      .select("id")
      .eq("import_token", token)
      .maybeSingle();
    userId = u?.id ?? null;
  }

  const { data: inserted, error } = await supabase
    .from("inbound_emails")
    .insert({
      sender: from,
      recipient: to,
      subject,
      message_id: messageId,
      raw,
      size,
      user_id: userId,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[inbound-email] insert failed", error?.message);
    return NextResponse.json({ error: "store failed" }, { status: 500 });
  }

  console.log(
    "[inbound-email] stored",
    JSON.stringify({ from, to, subject, size, user: Boolean(userId) }),
  );

  // 本人が特定できたものはレスポンス後にバックグラウンド抽出（Worker は即 200）。
  if (userId) {
    const emailId = inserted.id;
    const uid = userId;
    after(() => extractInBackground(supabase, emailId, uid, raw));
  }

  return NextResponse.json({ ok: true });
}
