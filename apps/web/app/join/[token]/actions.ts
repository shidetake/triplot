"use server";

import { getTranslations } from "next-intl/server";

import { joinTripViaInvite } from "@triplot/shared/data/invites";
import { createClient } from "@/lib/supabase/server";
import { translateSharedError } from "@/lib/translateSharedError";

// 参加を確定する。セッション（匿名 or Google）必須。
//
// 成功時はここで redirect() せず tripId を返すだけにする。呼び出し側
// （join-form.tsx）が hard-redirect.tsx の hardRedirect() で遷移する
// （理由はそちらのコメント参照）。
export async function joinAction(
  token: string,
  displayName: string,
): Promise<{ error: string } | { tripId: string }> {
  const t = await getTranslations("validation");
  const tErr = await getTranslations("errors");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: t("noSession") };
  }

  const result = await joinTripViaInvite(supabase, token, displayName);
  if (!result.ok) return { error: translateSharedError(result.error, tErr) };

  return { tripId: result.data.tripId };
}
