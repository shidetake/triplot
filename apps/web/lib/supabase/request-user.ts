import { createClient as createBearerClient } from "@supabase/supabase-js";

import type { Database } from "@triplot/shared/types/database";

import { createClient } from "@/lib/supabase/server";

// API エンドポイント（web と iOS の両方から呼ぶもの）で、ログイン中の人と、その人の
// 権限で読み書きするクライアントを解決する。web は cookie、iOS は
// Authorization: Bearer <access_token>（cookie が無い環境）を使う。
//
// 書き込みの入口なので getUser() で確かめる（取り消されたセッションを通さない。
// lib/supabase/auth-user.ts の getAuthUser との使い分け）。
export async function resolveRequestUser(request: Request) {
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
