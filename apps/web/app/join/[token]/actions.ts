"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { joinTripViaInvite } from "@triplot/shared/data/invites";
import { createClient } from "@/lib/supabase/server";
import { translateSharedError } from "@/lib/translateSharedError";

// 参加を確定する。セッション（匿名 or Google）必須。成功で trip へ redirect。
export async function joinAction(
  token: string,
  displayName: string,
): Promise<{ error: string }> {
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

  redirect(`/trips/${result.data.tripId}`);
}
