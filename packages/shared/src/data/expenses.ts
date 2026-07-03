import type { Currency, Visibility } from "../types/database";
import type { DB } from "./client";
import { type PlaceInput, placeRpcArgs } from "./place";
import { err, ok, type Result } from "./result";

// 費用の共通フィールド（場所は PlaceInput で受け、サーバ側で place_id 解決）。
// フィールド検証（金額>0・通貨・レート・カテゴリ・支払者・割り勘対象）は呼び出し側。
export type ExpenseFields = {
  localPrice: number;
  localCurrency: Currency;
  rateToDefault: number;
  categoryId: string;
  payerMemberId: string;
  visibility: Visibility;
  splittable: boolean;
  note: string;
  paidAt: string;
  // 乗継当日の選択。非曖昧な日は null。
  tzDisambigTransitId: string | null;
  tzDisambigSide: "depart" | "arrive" | null;
  splitMemberIds: string[];
  place: PlaceInput;
};

function expenseBase(f: ExpenseFields) {
  return {
    p_local_price: f.localPrice,
    p_local_currency: f.localCurrency,
    p_rate_to_default: f.rateToDefault,
    p_category_id: f.categoryId,
    p_payer_member_id: f.payerMemberId,
    p_visibility: f.visibility,
    p_splittable: f.splittable,
    p_note: f.note, // 空文字は DB 側 nullif で NULL
    p_paid_at: f.paidAt,
    p_split_member_ids: f.splittable ? f.splitMemberIds : [],
    // gen-types は nullable 引数を string にする癖。
    p_tz_disambig_transit_id: f.tzDisambigTransitId as unknown as string,
    p_tz_disambig_side: f.tzDisambigSide as unknown as string,
  };
}

// 成功時は作成した費用の id を返す（取り込み下書きの確定リンクに使う）。
export async function createExpense(
  sb: DB,
  tripId: string,
  f: ExpenseFields,
): Promise<Result<string>> {
  const base = { p_trip_id: tripId, ...expenseBase(f) };
  const pr = placeRpcArgs(f.place);
  let expenseId: string | null = null;
  let error: { message: string } | null = null;
  if (pr.variant === "google") {
    const { data, error: e } = await sb.rpc("create_expense_with_place", {
      ...base,
      ...pr.args,
    });
    expenseId = data as string | null;
    error = e;
  } else if (pr.variant === "free") {
    const { data, error: e } = await sb.rpc(
      "create_expense_with_freetext_place",
      { ...base, ...pr.args },
    );
    expenseId = data as string | null;
    error = e;
  } else {
    const { data, error: e } = await sb.rpc("create_expense", {
      ...base,
      ...pr.args,
    });
    expenseId = data as string | null;
    error = e;
  }
  if (error) return err(error.message);
  if (!expenseId) return err("create_expense returned no id");
  return ok(expenseId);
}

export async function updateExpense(
  sb: DB,
  expenseId: string,
  f: ExpenseFields,
): Promise<Result<void>> {
  const base = { p_expense_id: expenseId, ...expenseBase(f) };
  const pr = placeRpcArgs(f.place);
  let error: { message: string } | null = null;
  if (pr.variant === "google") {
    error = (
      await sb.rpc("update_expense_with_place", { ...base, ...pr.args })
    ).error;
  } else if (pr.variant === "free") {
    error = (
      await sb.rpc("update_expense_with_freetext_place", {
        ...base,
        ...pr.args,
      })
    ).error;
  } else {
    error = (await sb.rpc("update_expense", { ...base, ...pr.args })).error;
  }
  if (error) return err(error.message);
  return ok(undefined);
}

export async function deleteExpense(
  sb: DB,
  expenseId: string,
): Promise<Result<void>> {
  const { error } = await sb.from("expenses").delete().eq("id", expenseId);
  if (error) return err(error.message);
  return ok(undefined);
}
