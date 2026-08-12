import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

import type { Database } from "@triplot/shared/types/database";

// RN 用 Supabase クライアント（Supabase 公式の RN パターン）。
// packages/shared/src/data/client.ts の `DB` 型（SupabaseClient<Database>）と
// 互換なので、shared のデータ関数にそのまま渡せる。
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY が未設定です（apps/mobile/.env.local）",
  );
}

// 認証エラー(401)を受けたら、トークンを取り直して1回だけ黙って投げ直す。
//
// supabase-js のトークン更新は「期限が近づいたら」の時間ベースだけで、**サーバに
// 拒否されたことを理由に取り直す経路が無い**。そのため、保存済みトークンがサーバ
// から見て無効になった状態（例: サーバの時計が後ろに補正されて `iat` が未来扱いに
// なる = "JWT issued at future"）に入ると、アプリを再起動して新しいトークンを
// 取り直すまで全リクエストが失敗し続ける（実機で発生）。
//
// TanStack Query の retry ではこれを救えない。shared のデータ関数はエラーを
// throw せず戻り値（`{ data, error }`）で返すものが多く、Query からは「成功」に
// 見えて retry が発火しないため。fetch 層に置けば呼び出し側の書き方に関係なく
// 全経路に効く。
//
// ユーザには見えない（UI にエラーが出る前に完結する。増えるのは往復2回ぶんの
// 待ち時間だけ）。
let client: ReturnType<typeof createClient<Database>> | null = null;
// 同時に複数のリクエストが 401 を受けた時（フォアグラウンド復帰時など）に
// 更新要求が殺到しないよう、進行中の更新は共有する。
let refreshing: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  refreshing ??= (async () => {
    try {
      const { data } = await client!.auth.refreshSession();
      return data.session?.access_token ?? null;
    } catch {
      return null;
    } finally {
      // 次の 401 では改めて取り直せるように解放する。
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

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    // ブラウザの OAuth リダイレクト URL 検出は RN では不要（native sign-in を使う）。
    detectSessionInUrl: false,
  },
  global: { fetch: authAwareFetch },
});
client = supabase;

// フォアグラウンドの間だけトークン自動更新を回す（バックグラウンドのタイマーは
// OS に殺されるため、復帰時に再開する。Supabase ドキュメントの推奨パターン）。
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
