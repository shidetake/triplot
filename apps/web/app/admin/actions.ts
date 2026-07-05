"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

// フィードバックの対応状態を切り替える（admin のみ）。権限は RLS
// （feedback_admin_update = is_app_admin()）と列レベル grant（status のみ）が担保する。
export async function updateFeedbackStatusAction(
  id: string,
  status: "open" | "done",
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("feedback")
    .update({ status })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin");
  return { error: null };
}
