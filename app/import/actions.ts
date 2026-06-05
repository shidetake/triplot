"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

// 下書きを破棄する（本人の行のみ。RPC 側で auth.uid() を確認）。
export async function dismissDraftAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;
  const supabase = await createClient();
  await supabase.rpc("resolve_inbound_email", {
    p_id: id,
    p_status: "dismissed",
  });
  revalidatePath("/import");
}

// 下書きを旅行に割り当てる（費用化＝確定は旅行画面で行う）。
export async function assignTripAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const tripId = formData.get("trip_id");
  if (typeof id !== "string" || !id) return;
  const supabase = await createClient();
  await supabase.rpc("assign_inbound_email_trip", {
    p_id: id,
    // gen-types は nullable 引数を string にする癖。未選択は null で渡す。
    p_trip_id: (typeof tripId === "string" && tripId
      ? tripId
      : null) as unknown as string,
  });
  revalidatePath("/import");
}
