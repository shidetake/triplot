import { pickCategoryColor } from "../categoryColor";
import type { DB } from "./client";
import { err, ok, type Result } from "./result";

// カスタムカテゴリのアイコンは固定（汎用「category」）。
// **色は固定しない** —— 同じ旅行の既存カテゴリから一番離れた色相を選ぶ
// （categoryColor.ts。メンバー色と同じ farthest-point）。全部同じ色だと、
// 色が主役になる円グラフで切れを見分けられない。
export const CUSTOM_CATEGORY_ICON = "category";

// 削除が使用中（expenses.category_id の on delete restrict）で弾かれたときの
// センチネル。呼び出し側が i18n の「使用中」メッセージに変換する。
export const CATEGORY_IN_USE = "category-in-use";

// カスタムカテゴリを末尾（sort_order 最大 + 1）に追加する。
// 作った id を返す（費用フォームのカテゴリ選択は、追加したものをそのまま
// 選んで閉じるため。管理シート側は使わない）。
export async function createExpenseCategory(
  sb: DB,
  tripId: string,
  name: string,
): Promise<Result<{ id: string }>> {
  // 並び順（末尾）と色（既存から一番離れた色相）を決めるために、同じ旅行の
  // 既存カテゴリを1回だけ読む。
  const { data: siblings } = await sb
    .from("expense_categories")
    .select("sort_order, color")
    .eq("trip_id", tripId);
  const maxSortOrder = (siblings ?? []).reduce(
    (m, c) => Math.max(m, c.sort_order),
    0,
  );

  const { data, error } = await sb
    .from("expense_categories")
    .insert({
      trip_id: tripId,
      name: name.trim(),
      color: pickCategoryColor((siblings ?? []).map((c) => c.color)),
      icon: CUSTOM_CATEGORY_ICON,
      sort_order: maxSortOrder + 1,
      key: null,
    })
    .select("id")
    .single();
  if (error) return err(error.message);
  return ok({ id: data.id });
}

// カテゴリ名を変える。key を null にする＝改名した時点でカスタム扱い
// （i18n のデフォルト名参照を外す）。アイコンは汎用に戻す。
// **色はそのまま残す** —— その色相は旅行の中で既に一意なので、作り直すと
// 他のカテゴリとぶつかりうる（かつ、名前を変えただけで色が変わるのも驚く）。
export async function updateExpenseCategoryName(
  sb: DB,
  id: string,
  name: string,
): Promise<Result<void>> {
  const { error } = await sb
    .from("expense_categories")
    .update({
      name: name.trim(),
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
