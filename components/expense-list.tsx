"use client";

import { useTransition } from "react";

import { deleteExpenseAction } from "@/app/trips/[tripId]/actions";
import type { Currency, Visibility } from "@/lib/types/database";

export type ExpenseRow = {
  id: string;
  amount: number;
  currency: Currency;
  visibility: Visibility;
  splittable: boolean;
  note: string | null;
  paid_at: string;
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
  myMemberId,
}: {
  tripId: string;
  expenses: ExpenseRow[];
  members: Member[];
  myMemberId: string;
}) {
  const memberById = new Map(members.map((m) => [m.id, m]));

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
  canDelete,
}: {
  tripId: string;
  expense: ExpenseRow;
  memberById: Map<string, Member>;
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
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {formatAmount(expense.amount, expense.currency)}
          </span>
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
