"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

// 既定の表示名（users.display_name）を更新する。旅行作成/参加時のデフォルトに使われる。
// 各旅行ごとの表示名（trip_members.display_name）は別物で、ここでは触らない。
// RLS の users_self_update（id = auth.uid()）で本人の行だけ更新できる。
export async function updateDisplayNameAction(formData: FormData): Promise<void> {
  const raw = formData.get("display_name");
  const name = typeof raw === "string" ? raw.trim() : "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("users")
    // 空ならクリア（null）。null のときはホーム側で Google の名前にフォールバックする。
    .update({ display_name: name || null })
    .eq("id", user.id);
  revalidatePath("/settings");
}
