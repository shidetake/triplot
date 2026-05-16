"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { Currency, Visibility } from "@/lib/types/database";

export type CreateExpenseState = {
  error: string | null;
  ok: boolean;
};

export async function createExpenseAction(
  tripId: string,
  _prevState: CreateExpenseState,
  formData: FormData,
): Promise<CreateExpenseState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "ログインしてください" };
  }

  const localPriceRaw = (formData.get("local_price") as string | null) ?? "";
  const localPrice = Number.parseFloat(localPriceRaw);
  const localCurrency = formData.get("local_currency") as Currency | null;
  const rateRaw = (formData.get("rate_to_default") as string | null) ?? "";
  const rateToDefault = Number.parseFloat(rateRaw);
  const categoryId = (formData.get("category_id") as string | null) ?? "";
  const payerMemberId =
    (formData.get("payer_member_id") as string | null) ?? "";
  const visibility =
    (formData.get("visibility") as Visibility | null) ?? "shared";
  const splittable =
    visibility === "shared" && formData.get("splittable") === "on";
  const note = ((formData.get("note") as string | null) ?? "").trim();
  const paidAtRaw = (formData.get("paid_at") as string | null) ?? "";
  // <input type="date"> は "YYYY-MM-DD"。timestamptz として送るため T00:00 を足す。
  // 未入力なら現在時刻（DB 側 coalesce もあるが型を string に保つ）。
  const paidAt = paidAtRaw
    ? `${paidAtRaw}T00:00:00`
    : new Date().toISOString();

  const splitMemberIds = formData.getAll("split_member_ids").map(String);

  if (!Number.isFinite(localPrice) || localPrice <= 0) {
    return { ok: false, error: "金額は正の数で入力してください" };
  }
  if (!localCurrency || !["JPY", "USD"].includes(localCurrency)) {
    return { ok: false, error: "通貨を選んでください" };
  }
  if (!Number.isFinite(rateToDefault) || rateToDefault <= 0) {
    return { ok: false, error: "為替レートは正の数で入力してください" };
  }
  if (!categoryId) {
    return { ok: false, error: "カテゴリを選んでください" };
  }
  if (!payerMemberId) {
    return { ok: false, error: "支払った人を選んでください" };
  }
  if (splittable && splitMemberIds.length === 0) {
    return { ok: false, error: "割り勘対象を1人以上選んでください" };
  }

  const { error } = await supabase.rpc("create_expense", {
    p_trip_id: tripId,
    p_local_price: localPrice,
    p_local_currency: localCurrency,
    p_rate_to_default: rateToDefault,
    p_category_id: categoryId,
    p_payer_member_id: payerMemberId,
    p_visibility: visibility,
    p_splittable: splittable,
    p_note: note, // 空文字は DB 側 nullif で NULL になる
    p_paid_at: paidAt,
    p_split_member_ids: splittable ? splitMemberIds : [],
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/trips/${tripId}`);
  return { ok: true, error: null };
}

export async function deleteExpenseAction(
  tripId: string,
  expenseId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "ログインしてください" };
  }

  const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/trips/${tripId}`);
  return { error: null };
}

export type CreatePlaceState = {
  error: string | null;
  ok: boolean;
};

export async function createPlaceAction(
  tripId: string,
  _prevState: CreatePlaceState,
  formData: FormData,
): Promise<CreatePlaceState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "ログインしてください" };
  }

  const name = ((formData.get("name") as string | null) ?? "").trim();
  const statusId = (formData.get("status_id") as string | null) ?? "";
  const visibility =
    (formData.get("visibility") as Visibility | null) ?? "shared";
  const note = ((formData.get("note") as string | null) ?? "").trim();
  const googlePlaceId = (
    (formData.get("google_place_id") as string | null) ?? ""
  ).trim();

  const parseCoord = (raw: string | null): number | null => {
    const n = Number.parseFloat(raw ?? "");
    return Number.isFinite(n) ? n : null;
  };
  const lat = parseCoord(formData.get("lat") as string | null);
  const lng = parseCoord(formData.get("lng") as string | null);

  if (!name) {
    return { ok: false, error: "場所を検索して選択してください" };
  }
  if (!statusId) {
    return { ok: false, error: "ステータスを選んでください" };
  }
  if (!["shared", "private"].includes(visibility)) {
    return { ok: false, error: "公開範囲が不正です" };
  }

  const { error } = await supabase.rpc("create_place", {
    p_trip_id: tripId,
    p_name: name,
    p_status_id: statusId,
    p_visibility: visibility,
    p_note: note, // 空文字は DB 側 nullif で NULL になる
    p_google_place_id: googlePlaceId,
    // gen-types は DEFAULT 無し nullable 関数引数を非 null 型にする既知の癖。
    // 座標は手入力時 null になりうる（plpgsql 側は null 許容）。呼び出し側でキャスト。
    p_lat: lat as number,
    p_lng: lng as number,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/trips/${tripId}`);
  return { ok: true, error: null };
}

export async function deletePlaceAction(
  tripId: string,
  placeId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "ログインしてください" };
  }

  const { error } = await supabase.from("places").delete().eq("id", placeId);
  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/trips/${tripId}`);
  return { error: null };
}
