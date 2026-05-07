"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type CreateTripState = {
  error: string | null;
};

export async function createTripAction(
  _prevState: CreateTripState,
  formData: FormData,
): Promise<CreateTripState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "ログインしてください" };
  }

  const title = ((formData.get("title") as string | null) ?? "").trim();
  const displayName = (
    (formData.get("display_name") as string | null) ?? ""
  ).trim();
  const startDate = (formData.get("start_date") as string) || null;
  const endDate = (formData.get("end_date") as string) || null;
  const defaultCurrency = formData.get("default_currency") as "JPY" | "USD";
  const usdToJpyRaw = formData.get("usd_to_jpy_rate") as string | null;
  const usdToJpy = usdToJpyRaw ? Number.parseFloat(usdToJpyRaw) : null;

  if (!title || !displayName) {
    return { error: "タイトルと表示名は必須です" };
  }

  const { data: tripId, error } = await supabase.rpc("create_trip", {
    p_title: title,
    p_start_date: startDate,
    p_end_date: endDate,
    p_default_currency: defaultCurrency,
    p_display_name: displayName,
    p_usd_to_jpy_rate:
      Number.isFinite(usdToJpy) && (usdToJpy ?? 0) > 0 ? usdToJpy : null,
  });

  if (error || !tripId) {
    return { error: error?.message ?? "旅行の作成に失敗しました" };
  }

  redirect(`/trips/${tripId}`);
}
