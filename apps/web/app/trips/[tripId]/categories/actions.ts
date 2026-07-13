"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import {
  CATEGORY_IN_USE,
  createExpenseCategory,
  deleteExpenseCategory,
  updateExpenseCategoryName,
} from "@triplot/shared/data/categories";

import { createClient } from "@/lib/supabase/server";

// 本体は shared/data/categories（RN と共通）。ここは i18n のエラーメッセージ化と
// revalidatePath だけを担う薄いラッパー。

function revalidate(tripId: string) {
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/categories`);
}

export async function createCategoryAction(
  tripId: string,
  name: string,
): Promise<{ error: string | null }> {
  const t = await getTranslations("categories");
  if (!name.trim()) return { error: t("nameRequired") };

  const supabase = await createClient();
  const r = await createExpenseCategory(supabase, tripId, name);
  if (!r.ok) return { error: t("saveFailed") };
  revalidate(tripId);
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
  const r = await updateExpenseCategoryName(supabase, id, name);
  if (!r.ok) return { error: t("saveFailed") };
  revalidate(tripId);
  return { error: null };
}

export async function deleteCategoryAction(
  id: string,
  tripId: string,
): Promise<{ error: string | null }> {
  const t = await getTranslations("categories");
  const supabase = await createClient();
  const r = await deleteExpenseCategory(supabase, id);
  if (!r.ok) {
    return {
      error: r.error === CATEGORY_IN_USE ? t("deleteInUse") : t("deleteFailed"),
    };
  }
  revalidate(tripId);
  return { error: null };
}
