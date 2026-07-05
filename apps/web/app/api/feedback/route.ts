import { NextResponse } from "next/server";

import { createClient as createBearerClient } from "@supabase/supabase-js";

import { feedbackInputSchema } from "@triplot/shared/feedback";
import type { Database } from "@triplot/shared/types/database";

import { createClient } from "@/lib/supabase/server";

// ユーザーフィードバック（不具合報告・要望）の書き込み経路。web も将来の RN も
// この route を叩く（architecture.md「変更系は RN からも使えるよう API エンドポイントに
// 出す」）。insert は本人のクライアントで行い RLS（insert-own）を効かせる。

// 認証ユーザーとそのクライアントを解決する。web は cookie、RN は
// Authorization: Bearer <access_token>（cookie が無い環境）を使う。
async function resolveUser(request: Request) {
  const cookieClient = await createClient();
  const {
    data: { user },
  } = await cookieClient.auth.getUser();
  if (user) return { supabase: cookieClient, user };

  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const bearerClient = createBearerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const {
      data: { user: bearerUser },
    } = await bearerClient.auth.getUser();
    if (bearerUser) return { supabase: bearerClient, user: bearerUser };
  }
  return null;
}

export async function POST(request: Request) {
  const resolved = await resolveUser(request);
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

  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    kind: input.kind,
    body: input.body,
    path: input.path ?? null,
    user_agent: request.headers.get("user-agent"),
  });
  if (error) {
    console.error("[feedback] insert failed", error.message);
    return NextResponse.json({ error: "store failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
