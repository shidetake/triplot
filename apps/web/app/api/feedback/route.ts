import { after, NextResponse } from "next/server";

import { feedbackInputSchema } from "@triplot/shared/feedback";

import { notifyFeedback } from "@/lib/feedback/notify";
import { resolveRequestUser } from "@/lib/supabase/request-user";
import { getVersion } from "@/lib/version";

// ユーザーフィードバック（不具合報告・要望）の書き込み経路。web も iOS も
// この route を叩く（architecture.md「変更系は RN からも使えるよう API エンドポイントに
// 出す」）。insert は本人のクライアントで行い RLS（insert-own）を効かせる。

export async function POST(request: Request) {
  const resolved = await resolveRequestUser(request);
  if (!resolved) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { supabase, user } = resolved;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = feedbackInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const input = parsed.data;

  const userAgent = request.headers.get("user-agent");
  // デプロイ時点のバージョン（getVersion() が持つ）。
  const appVersion = getVersion();

  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    kind: input.kind,
    body: input.body,
    path: input.path ?? null,
    user_agent: userAgent,
    platform: input.platform,
    viewport: input.viewport ?? null,
    timezone: input.timezone ?? null,
    theme: input.theme ?? null,
    app_version: appVersion,
  });
  if (error) {
    console.error("[feedback] insert failed", error.message);
    return NextResponse.json({ error: "store failed" }, { status: 500 });
  }

  // 応答後にメール通知（投稿者へ受付確認・管理者へ新着通知）。best-effort。
  after(() =>
    notifyFeedback({
      input,
      userEmail: user.email ?? null,
      userAgent,
      appVersion,
    }),
  );

  return NextResponse.json({ ok: true });
}
