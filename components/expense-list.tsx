"use client";

import { useTransition } from "react";

import { deleteExpenseAction } from "@/app/trips/[tripId]/actions";
import type { Currency, Visibility } from "@/lib/types/database";

import type { Category } from "./expense-form";

export type ExpenseRow = {
  id: string;
  local_price: number;
  local_currency: Currency;
  rate_to_default: number;
  category_id: string;
  visibility: Visibility;
  splittable: boolean;
  note: string | null;
  paid_at: string;
  created_at: string;
  payer_member_id: string;
  created_by_member_id: string;
  split_member_ids: string[];
};

type Member = {
  id: string;
  display_name: string;
};

export function ExpenseList({
  tripId,
  expenses,
  members,
  categories,
  defaultCurrency,
  myMemberId,
}: {
  tripId: string;
  expenses: ExpenseRow[];
  members: Member[];
  categories: Category[];
  defaultCurrency: Currency;
  myMemberId: string;
}) {
  const memberById = new Map(members.map((m) => [m.id, m]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  if (expenses.length === 0) {
    return (
      <p className="text-sm text-zinc-500">まだ費用は登録されていません。</p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white">
      {expenses.map((e) => (
        <ExpenseRowItem
          key={e.id}
          tripId={tripId}
          expense={e}
          memberById={memberById}
          category={categoryById.get(e.category_id)}
          defaultCurrency={defaultCurrency}
          canDelete={
            e.visibility === "private"
              ? e.created_by_member_id === myMemberId
              : true
          }
        />
      ))}
    </ul>
  );
}

function ExpenseRowItem({
  tripId,
  expense,
  memberById,
  category,
  defaultCurrency,
  canDelete,
}: {
  tripId: string;
  expense: ExpenseRow;
  memberById: Map<string, Member>;
  category: Category | undefined;
  defaultCurrency: Currency;
  canDelete: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const payerName =
    memberById.get(expense.payer_member_id)?.display_name ?? "?";
  const splitNames = expense.splittable
    ? expense.split_member_ids
        .map((id) => memberById.get(id)?.display_name ?? "?")
        .join(", ")
    : null;

  const isForeign = expense.local_currency !== defaultCurrency;
  const amountInDefault = expense.local_price * expense.rate_to_default;

  const onDelete = () => {
    if (!confirm("この費用を削除しますか？")) return;
    startTransition(async () => {
      const { error } = await deleteExpenseAction(tripId, expense.id);
      if (error) alert(`削除に失敗しました: ${error}`);
    });
  };

  return (
    <li className="flex items-start justify-between gap-3 p-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {category && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
              style={{ backgroundColor: category.color }}
            >
              <span>{category.emoji}</span>
              <span>{category.name}</span>
            </span>
          )}
          <span className="font-medium">
            {formatAmount(amountInDefault, defaultCurrency)}
          </span>
          {isForeign && (
            <span className="text-xs text-zinc-500">
              ({formatAmount(expense.local_price, expense.local_currency)} @{" "}
              {expense.rate_to_default})
            </span>
          )}
          {expense.visibility === "private" && (
            <span className="rounded bg-zinc-100 px-1.5 text-xs text-zinc-600">
              プライベート
            </span>
          )}
          {expense.visibility === "shared" && !expense.splittable && (
            <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-700">
              おごり
            </span>
          )}
        </div>
        <div className="mt-1 text-xs text-zinc-600">
          <span>{formatDate(expense.paid_at)}</span>
          <span className="mx-1">・</span>
          <span>支払: {payerName}</span>
          {splitNames && (
            <>
              <span className="mx-1">・</span>
              <span>割勘: {splitNames}</span>
            </>
          )}
        </div>
        {expense.note && (
          <p className="mt-1 text-xs text-zinc-700">{expense.note}</p>
        )}
      </div>
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={isPending}
          className="shrink-0 text-xs text-zinc-500 hover:text-red-600 disabled:opacity-50"
        >
          {isPending ? "削除中..." : "削除"}
        </button>
      )}
    </li>
  );
}

function formatAmount(amount: number, currency: Currency): string {
  const formatter = new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "JPY" ? 0 : 2,
  });
  return formatter.format(amount);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
