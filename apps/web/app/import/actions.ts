"use server";

import { revalidatePath } from "next/cache";

import {
  assignInboundEmailTrip,
  dismissDraft,
  unmergeInboundEmail,
} from "@triplot/shared/data/inbox";
import { createClient } from "@/lib/supabase/server";

// 下書きを破棄する（本人の行のみ。RPC 側で auth.uid() を確認）。
export async function dismissDraftAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;
  const supabase = await createClient();
  await dismissDraft(supabase, id);
  revalidatePath("/import");
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
