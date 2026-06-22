"use server";

import { revalidatePath } from "next/cache";

import { updateDisplayName } from "@triplot/shared/data/account";
import { createClient } from "@/lib/supabase/server";

// 既定の表示名（users.display_name）を更新する。旅行作成/参加時のデフォルトに使われる。
// 各旅行ごとの表示名（trip_members.display_name）は別物で、ここでは触らない。
export async function updateDisplayNameAction(formData: FormData): Promise<void> {
  const raw = formData.get("display_name");
  const name = typeof raw === "string" ? raw : "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await updateDisplayName(supabase, user.id, name);
  revalidatePath("/settings");
}
