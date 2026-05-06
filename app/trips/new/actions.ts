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
    error: userError,
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: `getUser failed: ${userError?.message ?? "no user"}`,
    };
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const title = ((formData.get("title") as string | null) ?? "").trim();
  const displayName = (
    (formData.get("display_name") as string | null) ?? ""
  ).trim();
  const startDate = (formData.get("start_date") as string) || null;
  const endDate = (formData.get("end_date") as string) || null;
  const defaultCurrency = formData.get("default_currency") as "JPY" | "USD";
  const usdToJpyRaw = formData.get("usd_to_jpy_rate") as string | null;
  const usdToJpy = usdToJpyRaw ? Number.parseFloat(usdToJpyRaw) : NaN;

  if (!title || !displayName) {
    return { error: "タイトルと表示名は必須です" };
  }

  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .insert({
      title,
      start_date: startDate,
      end_date: endDate,
      default_currency: defaultCurrency,
    })
    .select()
    .single();

  if (tripError || !trip) {
    return {
      error: `${tripError?.message ?? "旅行の作成に失敗しました"} | DEBUG user=${user.id.slice(0, 8)} hasSession=${!!session} tokenLen=${session?.access_token?.length ?? 0}`,
    };
  }

  const { error: memberError } = await supabase.from("trip_members").insert({
    trip_id: trip.id,
    user_id: user.id,
    display_name: displayName,
    kind: "member",
  });

  if (memberError) {
    return { error: `メンバー登録に失敗: ${memberError.message}` };
  }

  if (
    defaultCurrency === "JPY" &&
    Number.isFinite(usdToJpy) &&
    usdToJpy > 0
  ) {
    await supabase.from("trip_exchange_rates").insert({
      trip_id: trip.id,
      currency: "USD",
      rate_to_default: usdToJpy,
    });
  }

  redirect(`/trips/${trip.id}`);
}
