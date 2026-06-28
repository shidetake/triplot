"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";

// カスタムカテゴリのアイコン・色は固定（汎用「category」アイコン＋「その他」と同色）
const CUSTOM_ICON = "category";
const CUSTOM_COLOR = "#71717a";

export async function createCategoryAction(
  tripId: string,
  name: string,
): Promise<{ error: string | null }> {
  const t = await getTranslations("categories");
  if (!name.trim()) return { error: t("nameRequired") };

  const supabase = await createClient();
  const { data: maxRow } = await supabase
    .from("expense_categories")
    .select("sort_order")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("expense_categories").insert({
    trip_id: tripId,
    name: name.trim(),
    color: CUSTOM_COLOR,
    icon: CUSTOM_ICON,
    sort_order: (maxRow?.sort_order ?? 0) + 1,
    key: null,
  });

  if (error) return { error: error.message };
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/categories`);
  return { error: null };
}

export async function updateCategoryAction(
  id: string,
  tripId: string,
  name: string,
): Promise<{ error: string | null }> {
  const t = await getTranslations("categories");
  if (!name.trim()) return { error: t("nameRequired") };

  const supabase = await createClient();
  const { error } = await supabase
    .from("expense_categories")
    .update({ name: name.trim(), color: CUSTOM_COLOR, icon: CUSTOM_ICON, key: null })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/categories`);
  return { error: null };
}

export async function deleteCategoryAction(
  id: string,
  tripId: string,
): Promise<{ error: string | null }> {
  const t = await getTranslations("categories");
  const supabase = await createClient();
  const { error } = await supabase
    .from("expense_categories")
    .delete()
    .eq("id", id);

  if (error) {
    if (error.code === "23503") return { error: t("deleteInUse") };
    return { error: error.message };
  }
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/categories`);
  return { error: null };
}
