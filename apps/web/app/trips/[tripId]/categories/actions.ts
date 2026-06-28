"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";

export type CategoryMutationState = {
  error: string | null;
  ok: boolean;
};

export async function createCategoryAction(
  tripId: string,
  _prevState: CategoryMutationState,
  formData: FormData,
): Promise<CategoryMutationState> {
  const t = await getTranslations("categories");
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const color = (formData.get("color") as string | null) ?? "#71717a";
  const icon = (formData.get("icon") as string | null) ?? "category";

  if (!name) return { error: t("nameRequired"), ok: false };

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
    name,
    color,
    icon,
    sort_order: (maxRow?.sort_order ?? 0) + 1,
    // カスタムカテゴリは key = NULL（name をそのまま表示）
    key: null,
  });

  if (error) return { error: error.message, ok: false };
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/categories`);
  return { error: null, ok: true };
}

export async function updateCategoryAction(
  categoryId: string,
  tripId: string,
  _prevState: CategoryMutationState,
  formData: FormData,
): Promise<CategoryMutationState> {
  const t = await getTranslations("categories");
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const color = (formData.get("color") as string | null) ?? "#71717a";
  const icon = (formData.get("icon") as string | null) ?? "category";

  if (!name) return { error: t("nameRequired"), ok: false };

  const supabase = await createClient();
  // 編集すると key を NULL にする（ユーザーが明示的に変えた＝i18n 参照を外す）。
  const { error } = await supabase
    .from("expense_categories")
    .update({ name, color, icon, key: null })
    .eq("id", categoryId);

  if (error) return { error: error.message, ok: false };
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/categories`);
  return { error: null, ok: true };
}

export async function deleteCategoryAction(
  categoryId: string,
  tripId: string,
): Promise<CategoryMutationState> {
  const t = await getTranslations("categories");
  const supabase = await createClient();
  const { error } = await supabase
    .from("expense_categories")
    .delete()
    .eq("id", categoryId);

  if (error) {
    // 23503 = foreign key violation: expenses still reference this category
    if (error.code === "23503") return { error: t("deleteInUse"), ok: false };
    return { error: error.message, ok: false };
  }
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/categories`);
  return { error: null, ok: true };
}
