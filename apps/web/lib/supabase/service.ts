import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@triplot/shared/types/database";

// service_role クライアント（RLS バイパス）。ユーザセッションが無い
// サーバ間処理（受信メール webhook など）からのみ使う。
// SUPABASE_SERVICE_ROLE_KEY は server 専用。NEXT_PUBLIC_ では絶対に公開しない。
//
// 既存の 3 クライアント（client / server / proxy）はすべてユーザの cookie
// セッション前提で RLS 配下。これはその例外で、auth.uid() を持たない入口
// （例: Cloudflare Email Worker からの POST）専用。乱用しないこと。
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("supabase service client is not configured");
  }
  return createSupabaseClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
