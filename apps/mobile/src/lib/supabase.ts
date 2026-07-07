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

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    // ブラウザの OAuth リダイレクト URL 検出は RN では不要（native sign-in を使う）。
    detectSessionInUrl: false,
  },
});

// フォアグラウンドの間だけトークン自動更新を回す（バックグラウンドのタイマーは
// OS に殺されるため、復帰時に再開する。Supabase ドキュメントの推奨パターン）。
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
