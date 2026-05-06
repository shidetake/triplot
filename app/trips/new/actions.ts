"use server";

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

  // @supabase/ssr の createServerClient は INSERT 時に JWT を Authorization
  // ヘッダーに乗せていない様子（auth.uid() が RLS で null になる）。
  // 明示的に access_token を付けた basic クライアントで DB 操作を行う。
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

  const { data: trip, error: tripError } = await db
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
    let jwtInfo = "";
    try {
      const payloadB64 = session.access_token.split(".")[1];
      const json = Buffer.from(payloadB64, "base64").toString();
      const payload = JSON.parse(json) as Record<string, unknown>;
      jwtInfo = ` | JWT sub=${String(payload.sub).slice(0, 8)} role=${payload.role} aud=${payload.aud}`;
    } catch (e) {
      jwtInfo = ` | JWT decode failed: ${e instanceof Error ? e.message : String(e)}`;
    }
    let pgAuth = "";
    try {
      const { data: dbg } = await db.rpc("debug_auth" as never);
      pgAuth = ` | PG ${String(dbg)}`;
    } catch (e) {
      pgAuth = ` | RPC failed: ${e instanceof Error ? e.message : String(e)}`;
    }
    return {
      error: `${tripError?.message ?? "旅行の作成に失敗しました"}${jwtInfo}${pgAuth}`,
    };
  }

  const { error: memberError } = await db.from("trip_members").insert({
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
    await db.from("trip_exchange_rates").insert({
      trip_id: trip.id,
      currency: "USD",
      rate_to_default: usdToJpy,
    });
  }

  redirect(`/trips/${trip.id}`);
}
