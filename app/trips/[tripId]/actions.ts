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

  const amountRaw = (formData.get("amount") as string | null) ?? "";
  const amount = Number.parseFloat(amountRaw);
  const currency = formData.get("currency") as Currency | null;
  const payerMemberId = (formData.get("payer_member_id") as string | null) ?? "";
  const visibility = (formData.get("visibility") as Visibility | null) ?? "shared";
  const splittable =
    visibility === "shared" && formData.get("splittable") === "on";
  const note = ((formData.get("note") as string | null) ?? "").trim();
  const paidAtRaw = (formData.get("paid_at") as string | null) ?? "";
  // <input type="date"> は "YYYY-MM-DD"。timestamptz として送るため T00:00 を足す。
  const paidAt = paidAtRaw ? `${paidAtRaw}T00:00:00` : null;

  const splitMemberIds = formData.getAll("split_member_ids").map(String);

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "金額は正の数で入力してください" };
  }
  if (!currency || !["JPY", "USD"].includes(currency)) {
    return { ok: false, error: "通貨を選んでください" };
  }
  if (!payerMemberId) {
    return { ok: false, error: "支払った人を選んでください" };
  }
  if (splittable && splitMemberIds.length === 0) {
    return { ok: false, error: "割り勘対象を1人以上選んでください" };
  }

  const { error } = await supabase.rpc("create_expense", {
    p_trip_id: tripId,
    p_amount: amount,
    p_currency: currency,
    p_payer_member_id: payerMemberId,
    p_visibility: visibility,
    p_splittable: splittable,
    p_note: note || null,
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
