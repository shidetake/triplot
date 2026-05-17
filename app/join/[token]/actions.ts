"use server";

import { redirect } from "next/navigation";

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

  const { data: tripId, error } = await supabase.rpc("join_trip_via_invite", {
    p_token: token,
    p_display_name: displayName,
  });

  if (error || !tripId) {
    return { error: error?.message ?? "参加に失敗しました" };
  }

  redirect(`/trips/${tripId}`);
}
