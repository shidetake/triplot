import type { DB } from "./client";
import { err, ok, type Result } from "./result";

// カスタムカテゴリのアイコン・色は固定（汎用「category」アイコン＋青で
// デフォルトカテゴリの「その他」と区別する）。
export const CUSTOM_CATEGORY_ICON = "category";
export const CUSTOM_CATEGORY_COLOR = "#3b82f6";

// 削除が使用中（expenses.category_id の on delete restrict）で弾かれたときの
// センチネル。呼び出し側が i18n の「使用中」メッセージに変換する。
export const CATEGORY_IN_USE = "category-in-use";

// カスタムカテゴリを末尾（sort_order 最大 + 1）に追加する。
export async function createExpenseCategory(
  sb: DB,
  tripId: string,
  name: string,
): Promise<Result<void>> {
  const { data: maxRow } = await sb
    .from("expense_categories")
    .select("sort_order")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await sb.from("expense_categories").insert({
    trip_id: tripId,
    name: name.trim(),
    color: CUSTOM_CATEGORY_COLOR,
    icon: CUSTOM_CATEGORY_ICON,
    sort_order: (maxRow?.sort_order ?? 0) + 1,
    key: null,
  });
  if (error) return err(error.message);
  return ok(undefined);
}

// カテゴリ名を変える。key を null にする＝改名した時点でカスタム扱い
// （i18n のデフォルト名参照を外す）。アイコン・色もカスタム固定値に揃える。
export async function updateExpenseCategoryName(
  sb: DB,
  id: string,
  name: string,
): Promise<Result<void>> {
  const { error } = await sb
    .from("expense_categories")
    .update({
      name: name.trim(),
      color: CUSTOM_CATEGORY_COLOR,
      icon: CUSTOM_CATEGORY_ICON,
      key: null,
    })
    .eq("id", id);
  if (error) return err(error.message);
  return ok(undefined);
}

// カテゴリを削除。費用が参照中（FK restrict, Postgres 23503）は
// CATEGORY_IN_USE を返す。
export async function deleteExpenseCategory(
  sb: DB,
  id: string,
): Promise<Result<void>> {
  const { error } = await sb.from("expense_categories").delete().eq("id", id);
  if (error) {
    return err(error.code === "23503" ? CATEGORY_IN_USE : error.message);
  }
  return ok(undefined);
}
