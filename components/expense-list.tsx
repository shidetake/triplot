"use client";

import { useState } from "react";

import type { LatLng } from "@/lib/placeMap";
import type { TripTzTimeline } from "@/lib/schedule";
import type { Currency, Visibility } from "@/lib/types/database";
import { formatAmount } from "@/lib/formatAmount";

import { ColorBadge } from "./color-badge";
import { type Category, ExpenseForm } from "./expense-form";
import { ExpenseCategoryIcon } from "./expense-category-icon";
import { type Anchor, FormPopover } from "./form-popover";
import { MemberAvatar } from "./member-avatar";
import { PlaceIcon } from "./place-list";

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
  tz: string;
};

type Member = {
  id: string;
  display_name: string;
  color: number | null;
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
  tzTimeline,
  tripStart,
  tripEnd,
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
  tzTimeline: TripTzTimeline;
  tripStart: string | null;
  tripEnd: string | null;
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
    return null;
  }

  return (
    <>
      <ul className="divide-y divide-foreground/10 rounded-md border border-foreground/10 bg-white">
        {expenses.map((e) => (
          <ExpenseRowItem
            key={e.id}
            expense={e}
            memberById={memberById}
            category={categoryById.get(e.category_id)}
            placeName={
              e.place_id ? (placeNameById.get(e.place_id) ?? null) : null
            }
            defaultCurrency={defaultCurrency}
            onEdit={(anchor) => setEditing({ expense: e, anchor })}
          />
        ))}
      </ul>

      {editing && (
        <FormPopover anchor={editing.anchor} onClose={closeEdit} label="費用を編集">
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
            tzTimeline={tzTimeline}
            tripStart={tripStart}
            tripEnd={tripEnd}
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
  expense,
  memberById,
  category,
  placeName,
  defaultCurrency,
  onEdit,
}: {
  expense: ExpenseRow;
  memberById: Map<string, Member>;
  category: Category | undefined;
  placeName: string | null;
  defaultCurrency: Currency;
  onEdit: (anchor: Anchor) => void;
}) {
  const payer = memberById.get(expense.payer_member_id);
  const splitMembers = expense.splittable
    ? expense.split_member_ids
        .map((id) => memberById.get(id))
        .filter((m): m is Member => !!m)
    : null;

  const isForeign = expense.local_currency !== defaultCurrency;
  const amountInDefault = expense.local_price * expense.rate_to_default;

  return (
    <li className="text-sm">
      <button
        type="button"
        onClick={(e) => onEdit({ x: e.clientX, y: e.clientY })}
        className="flex w-full items-start p-3 text-left transition hover:bg-foreground/10"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {category && (
              <ColorBadge
                color={category.color}
                icon={
                  <ExpenseCategoryIcon
                    icon={category.icon}
                    size={14}
                    className="shrink-0"
                  />
                }
              >
                {category.name}
              </ColorBadge>
            )}
            <span className="font-medium">
              {formatAmount(amountInDefault, defaultCurrency)}
            </span>
            {isForeign && (
              <span className="text-xs text-muted-foreground">
                ({formatAmount(expense.local_price, expense.local_currency)} @{" "}
                {expense.rate_to_default})
              </span>
            )}
            {expense.visibility === "private" && (
              <span className="rounded bg-zinc-100 px-1.5 text-xs text-muted-foreground">
                プライベート
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{formatDateTime(expense.paid_at)}</span>
            <span className="inline-flex items-center gap-1">
              支払
              <MemberAvatar
                name={payer?.display_name}
                color={payer?.color}
              />
            </span>
            {splitMembers && splitMembers.length > 0 && (
              <span className="inline-flex items-center gap-1">
                割勘
                <span className="inline-flex flex-wrap items-center gap-0.5">
                  {splitMembers.map((m) => (
                    <MemberAvatar
                      key={m.id}
                      name={m.display_name}
                      color={m.color}
                    />
                  ))}
                </span>
              </span>
            )}
          </div>
          {placeName && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <PlaceIcon icon="pin" size={12} className="shrink-0" />
              <span className="min-w-0 truncate">{placeName}</span>
            </p>
          )}
          {expense.note && (
            <p className="mt-1 text-xs text-muted-foreground">{expense.note}</p>
          )}
        </div>
      </button>
    </li>
  );
}


// paid_at は wall clock として保存している（フォームで送る文字列に TZ を
// 付けず Supabase session(UTC) で解釈させ、読み戻しの UTC 表現がそのまま
// 入力時の壁時計になる）。ここでは Date 経由ではなく文字列スライスで
// 取り出し、表示時のローカル TZ ズレを避ける。
function formatDateTime(iso: string): string {
  const [, mo, d] = iso.slice(0, 10).split("-").map(Number);
  const hhmm = iso.slice(11, 16);
  // 時刻未入力で作成された既存データは 00:00 のはず。日付だけ出す。
  return hhmm === "00:00" ? `${mo}/${d}` : `${mo}/${d} ${hhmm}`;
}
