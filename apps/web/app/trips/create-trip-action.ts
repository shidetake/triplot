"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createTrip, type Currency } from "@triplot/shared/data/trips";

export type CreateTripState = { error: string | null };

export async function createTripAction(
  _prev: CreateTripState,
  formData: FormData,
): Promise<CreateTripState> {
  const supabase = await createClient();
  const t = await getTranslations();
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
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/trips");
  redirect(`/trips/${result.data.tripId}`);
}
