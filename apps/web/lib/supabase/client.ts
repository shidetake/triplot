import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@triplot/shared/types/database";

// 認証エラー(401)を受けたら、トークンを取り直して1回だけ黙って投げ直す。
//
// proxy.ts がページ遷移のたびにセッションを検査・更新しているが、遷移を挟まない
// クライアント側の操作（ボタン押下でのミューテーション等）はそこを通らない。
// supabase-js のトークン更新は「期限が近づいたら」の時間ベースだけで、サーバに
// 拒否されたことを理由に取り直す経路が無いため、そのままだと同じ操作を何度
// 繰り返しても失敗し続ける（apps/mobile/src/lib/supabase.ts の authAwareFetch
// と同じ理由・同じ形）。
let client: SupabaseClient<Database> | null = null;
let refreshing: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  refreshing ??= (async () => {
    try {
      const { data } = await client!.auth.refreshSession();
      return data.session?.access_token ?? null;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

const authAwareFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (res.status !== 401) return res;

  const target =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  // 認証エンドポイント自身は対象外（更新の失敗でまた更新を呼ぶ無限ループを防ぐ）。
  if (target.includes("/auth/v1/")) return res;

  const token = await refreshAccessToken();
  if (!token) return res; // 取り直せなければ元の 401 をそのまま返す

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  // ここで呼ぶのは素の fetch なので、やり直しは1回だけで再帰しない。
  return fetch(input, { ...init, headers });
};

export function createClient() {
  // createBrowserClient はブラウザではシングルトンを返すので、この関数は
  // 何度呼ばれても実質1回しか初期化されない。
  client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: authAwareFetch } },
  );
  return client;
}
