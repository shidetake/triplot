"use client";

import { useState, useTransition } from "react";

import { deleteExpenseAction } from "@/app/trips/[tripId]/actions";
import type { LatLng } from "@/lib/placeMap";
import type { Currency, Visibility } from "@/lib/types/database";

import { type Category, ExpenseForm } from "./expense-form";
import { type Anchor, FormPopover } from "./form-popover";

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
  place_id: string | null;
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
  places,
  defaultCurrency,
  initialCurrency,
  initialCategoryId,
  averageRates,
  initialPaidAt,
  biasCenter,
  myMemberId,
}: {
  tripId: string;
  expenses: ExpenseRow[];
  members: Member[];
  categories: Category[];
  places: { id: string; name: string }[];
  defaultCurrency: Currency;
  // ExpenseForm の create-mode 用の値。編集モードでは使わないが、ExpenseForm
  // が共通して受け取る型なので透過に渡す。
  initialCurrency: Currency;
  initialCategoryId: string;
  averageRates: Partial<Record<Currency, number>>;
  initialPaidAt: string;
  biasCenter: LatLng;
  myMemberId: string;
}) {
  const memberById = new Map(members.map((m) => [m.id, m]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const placeNameById = new Map(places.map((p) => [p.id, p.name]));

  // 行タップで編集ポップオーバーを開く。anchor はクリック位置。
  const [editing, setEditing] = useState<{
    expense: ExpenseRow;
    anchor: Anchor;
  } | null>(null);
  const closeEdit = () => setEditing(null);

  if (expenses.length === 0) {
    return (
      <p className="text-sm text-zinc-500">まだ費用は登録されていません。</p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white">
        {expenses.map((e) => (
          <ExpenseRowItem
            key={e.id}
            tripId={tripId}
            expense={e}
            memberById={memberById}
            category={categoryById.get(e.category_id)}
            placeName={
              e.place_id ? (placeNameById.get(e.place_id) ?? null) : null
            }
            defaultCurrency={defaultCurrency}
            canDelete={
              e.visibility === "private"
                ? e.created_by_member_id === myMemberId
                : true
            }
            onEdit={(anchor) => setEditing({ expense: e, anchor })}
          />
        ))}
      </ul>

      {editing && (
        <FormPopover anchor={editing.anchor} onClose={closeEdit}>
          <ExpenseForm
            tripId={tripId}
            members={members}
            myMemberId={myMemberId}
            defaultCurrency={defaultCurrency}
            initialCurrency={initialCurrency}
            categories={categories}
            initialCategoryId={initialCategoryId}
            averageRates={averageRates}
            initialPaidAt={initialPaidAt}
            places={places}
            biasCenter={biasCenter}
            editExpense={editing.expense}
            canChangeVisibility={
              editing.expense.created_by_member_id === myMemberId
            }
            onDone={closeEdit}
          />
        </FormPopover>
      )}
    </>
  );
}

function ExpenseRowItem({
  tripId,
  expense,
  memberById,
  category,
  placeName,
  defaultCurrency,
  canDelete,
  onEdit,
}: {
  tripId: string;
  expense: ExpenseRow;
  memberById: Map<string, Member>;
  category: Category | undefined;
  placeName: string | null;
  defaultCurrency: Currency;
  canDelete: boolean;
  onEdit: (anchor: Anchor) => void;
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
    <li className="flex items-stretch text-sm">
      <button
        type="button"
        onClick={(e) => onEdit({ x: e.clientX, y: e.clientY })}
        className="flex min-w-0 flex-1 items-start p-3 text-left transition hover:bg-zinc-50"
      >
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
          {placeName && (
            <p className="mt-1 truncate text-xs text-zinc-600">
              📍 {placeName}
            </p>
          )}
          {expense.note && (
            <p className="mt-1 text-xs text-zinc-700">{expense.note}</p>
          )}
        </div>
      </button>
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={isPending}
          className="shrink-0 self-start p-3 text-xs text-zinc-500 hover:text-red-600 disabled:opacity-50"
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
