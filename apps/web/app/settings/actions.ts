"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { updateDisplayName } from "@triplot/shared/data/account";
import { isLocale, LOCALE_COOKIE } from "@/i18n/locale";
import { createClient } from "@/lib/supabase/server";

// 既定の表示名（users.display_name）を更新する。旅行作成/参加時のデフォルトに使われる。
// 各旅行ごとの表示名（trip_members.display_name）は別物で、ここでは触らない。
export async function updateDisplayNameAction(formData: FormData): Promise<void> {
  const raw = formData.get("display_name");
  const name = typeof raw === "string" ? raw : "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await updateDisplayName(supabase, user.id, name);
  revalidatePath("/settings");
}

// 表示言語を切り替える。NEXT_LOCALE Cookie に保存（i18n/locale の解決順で最優先）。
// レイアウト含め全体を再描画したいので layout スコープで revalidate。
export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
