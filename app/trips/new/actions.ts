"use server";

import { randomUUID } from "node:crypto";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

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
  if (!session) {
    return { error: "セッションがありません" };
  }

  // @supabase/ssr のクライアントは INSERT 時に JWT を Authorization に乗せ
  // 切れないことがあるため、明示的に access_token を付与した basic クライアントを使う。
  const db = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${session.access_token}` },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

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

  // ID をクライアント側で生成して、INSERT は RETURNING しない形にする。
  // RETURNING すると INSERT 直後の SELECT ポリシー評価が走り、まだ
  // trip_members に自分の行が無いため SELECT が拒否されエラーになる。
  const tripId = randomUUID();

  const { error: tripError } = await db.from("trips").insert({
    id: tripId,
    title,
    start_date: startDate,
    end_date: endDate,
    default_currency: defaultCurrency,
  });

  if (tripError) {
    return {
      error: `旅行の作成に失敗: ${tripError.message}`,
    };
  }

  const { error: memberError } = await db.from("trip_members").insert({
    trip_id: tripId,
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
    const { error: rateError } = await db.from("trip_exchange_rates").insert({
      trip_id: tripId,
      currency: "USD",
      rate_to_default: usdToJpy,
    });
    if (rateError) {
      // 為替レートは旅行作成の必須要件ではないので、失敗しても旅行作成自体は通す
      console.warn("failed to insert exchange rate:", rateError.message);
    }
  }

  redirect(`/trips/${tripId}`);
}
