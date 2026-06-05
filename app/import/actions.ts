"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

// 下書きを破棄する（本人の行のみ。RPC 側で auth.uid() を確認）。
export async function dismissDraftAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;
  const supabase = await createClient();
  await supabase.rpc("resolve_inbound_email", {
    p_id: id,
    p_status: "dismissed",
  });
  revalidatePath("/import");
}
