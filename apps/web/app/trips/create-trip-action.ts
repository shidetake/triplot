"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { translateSharedError } from "@/lib/translateSharedError";
import { assignInboundEmailsToTrip } from "@triplot/shared/data/inbox";
import { createTrip, type Currency } from "@triplot/shared/data/trips";

export type CreateTripState = { error: string | null };

export async function createTripAction(
  _prev: CreateTripState,
  formData: FormData,
): Promise<CreateTripState> {
  const supabase = await createClient();
  const t = await getTranslations();
  const tErr = await getTranslations("errors");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: t("common.loginRequired") };
  }

  const title = String(formData.get("title") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const currency = String(
    formData.get("default_currency") ?? "JPY",
  ) as Currency;
  const sourceTripId = String(formData.get("source_trip_id") ?? "").trim();
  const clientTz = String(formData.get("client_tz") ?? "").trim();
  // 旅行の候補（仮旅行）から作った時だけ入る。作成後にこのメール群を
  // 新しい旅行へ割り当てる（下書きの確定は旅行画面の通常フロー）。
  // 候補に何が含まれるかは deriveTripProposals が決める（日程に入る下書きは
  // 移動・宿泊でなくても候補の一部）。
  const importEmailIds = String(formData.get("import_email_ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!title || !startDate || !endDate || !displayName) {
    return { error: t("createTrip.fillAll") };
  }

  const result = await createTrip(supabase, {
    title,
    startDate,
    endDate,
    displayName,
    currency,
    sourceTripId: sourceTripId || undefined,
    clientTz,
  });
  if (!result.ok) return { error: translateSharedError(result.error, tErr) };

  if (importEmailIds.length > 0) {
    const assigned = await assignInboundEmailsToTrip(
      supabase,
      importEmailIds,
      result.data.tripId,
    );
    if (!assigned.ok) return { error: translateSharedError(assigned.error, tErr) };
  }

  revalidatePath("/trips");
  redirect(`/trips/${result.data.tripId}`);
}
