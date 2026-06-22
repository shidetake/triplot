import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../types/database";

// 共有データ関数が受け取る Supabase クライアントの型。
// web は @supabase/ssr の server/browser client、RN は @supabase/supabase-js の
// AsyncStorage クライアントを渡す。どちらも SupabaseClient<Database> 互換。
export type DB = SupabaseClient<Database>;
