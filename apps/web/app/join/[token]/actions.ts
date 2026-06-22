"use server";

import { redirect } from "next/navigation";

import { joinTripViaInvite } from "@triplot/shared/data/invites";
import { createClient } from "@/lib/supabase/server";

// 参加を確定する。セッション（匿名 or Google）必須。成功で trip へ redirect。
export async function joinAction(
  token: string,
  displayName: string,
): Promise<{ error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "セッションがありません。もう一度お試しください。" };
  }

  const result = await joinTripViaInvite(supabase, token, displayName);
  if (!result.ok) return { error: result.error };

  redirect(`/trips/${result.data.tripId}`);
}
