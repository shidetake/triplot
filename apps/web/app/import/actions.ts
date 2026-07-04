"use server";

import { revalidatePath } from "next/cache";

import {
  assignInboundEmailTrip,
  dismissInboundEmail,
  unmergeInboundEmail,
} from "@triplot/shared/data/inbox";
import { createClient } from "@/lib/supabase/server";

// メールを破棄する（残っている未確定の下書きごと。本人の行のみ。RPC 側で auth.uid() を確認）。
// 破壊的操作のため、呼び出し側で confirmDialog を挟んでから直接呼ぶ（<form action> は使わない）。
export async function dismissEmailAction(
  id: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const result = await dismissInboundEmail(supabase, id);
  if (!result.ok) return { error: result.error };
  revalidatePath("/import");
  return { error: null };
}

// 誤マージを取り消す（合体された子を独立下書きに戻す）。
export async function unmergeAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;
  const supabase = await createClient();
  await unmergeInboundEmail(supabase, id);
  revalidatePath("/import");
}

// 下書きを旅行に割り当てる（費用化＝確定は旅行画面で行う）。
export async function assignTripAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const tripId = formData.get("trip_id");
  if (typeof id !== "string" || !id) return;
  const supabase = await createClient();
  await assignInboundEmailTrip(
    supabase,
    id,
    typeof tripId === "string" && tripId ? tripId : null,
  );
  revalidatePath("/import");
}
