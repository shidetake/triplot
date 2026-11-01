"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

// つないでいる AI を外す。許可を取り消すと、その AI の鍵（セッション）も
// 消えるので、以後は読み書きできない（Supabase の revokeGrant）。
export async function disconnectAiAction(
  clientId: string,
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
  if (error) {
    console.error("[ai] revoke failed", error);
    return { ok: false };
  }
  revalidatePath("/ai");
  return { ok: true };
}
