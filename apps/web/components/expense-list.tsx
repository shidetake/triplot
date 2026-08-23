"use client";

import { Fragment, useState } from "react";
import { useTranslations } from "next-intl";

import { chipStyle } from "@/lib/themeColor";
import type { LatLng } from "@triplot/shared/placeMap";
import type { TripTzTimeline } from "@triplot/shared/schedule";
import type { Currency } from "@triplot/shared/types/database";
import { formatAmount } from "@triplot/shared/formatAmount";
import { formatRate } from "@triplot/shared/formatRate";

import { ColorBadge } from "./color-badge";
import { type Category, ExpenseForm } from "./expense-form";
import { ExpenseCategoryIcon } from "./expense-category-icon";
import { type Anchor, FormPopover } from "./form-popover";
import { MemberAvatar } from "./member-avatar";
import { PlaceIcon } from "./place-list";
import { PrivateBadge } from "./private-badge";

// 型の単一の真実は shared 側（RN と共用）。既存 import を壊さないよう re-export。
import type { ExpenseRow } from "@triplot/shared/tripDerive";
export type { ExpenseRow };

// 退会者を含む全員が渡る。支払者名と割り勘の対象は退会後も記録として残るので、
// ここで引けないと支払者が空欄になり、割り勘の人数が実際より少なく見える。
// 編集フォームに渡すときだけ active で絞る（もう選べない人を候補に出さない）。
type Member = {
  id: string;
  display_name: string;
  color: number | null;
  avatarUrl?: string | null;
  active: boolean;
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
  const t = useTranslations("expense");
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
      <ul className="divide-y divide-foreground/10 rounded-md border border-foreground/10 bg-background">
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
        <FormPopover
          anchor={editing.anchor}
          onClose={closeEdit}
          label={t("editFormLabel")}
          fullScreenOnNarrow
          draftKey={`expense:edit:${editing.expense.id}`}
        >
          <ExpenseForm
            tripId={tripId}
            members={members.filter((m) => m.active)}
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
  const t = useTranslations("expense");
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
        <div className="min-w-0 flex-1 space-y-1">
          {/* 1行目＝カテゴリ/金額（左）＋日時（右）、2行目＝場所（左）＋
              支払/割り勘（右）の2行構成。以前は縦に4行積んでいて件数が多い
              旅行で無駄に縦長だった（iOS で実機フィードバックを受けて詰めた
              形に揃える）。 */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
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
                  {formatRate(expense.rate_to_default)})
                </span>
              )}
              {expense.visibility === "private" && <PrivateBadge />}
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatDateTime(expense.paid_at)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="min-w-0 flex-1">
              {placeName && (
                <span className="flex items-center gap-1">
                  <PlaceIcon icon="pin" size={12} className="shrink-0" />
                  <span className="min-w-0 truncate">{placeName}</span>
                </span>
              )}
            </span>
            {/* 狭い画面は写真アバター、広い画面は色付きフルネームチップ（TODO 作成者と同じ）。 */}
            <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <span className="inline-flex items-center gap-1">
                {t("paidLabel")}
                <MemberAvatar
                  name={payer?.display_name}
                  color={payer?.color}
                  imageUrl={payer?.avatarUrl}
                  className="sm:hidden"
                />
                <span
                  style={chipStyle(payer?.color)}
                  className="hidden rounded-full px-2 py-0.5 text-xs font-medium leading-none sm:inline-block"
                >
                  {payer?.display_name ?? "?"}
                </span>
              </span>
              {splitMembers && splitMembers.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  {t("splitLabel")}
                  <span className="inline-flex flex-wrap items-center gap-0.5 sm:gap-1">
                    {splitMembers.map((m) => (
                      <Fragment key={m.id}>
                        <MemberAvatar
                          name={m.display_name}
                          color={m.color}
                          imageUrl={m.avatarUrl}
                          className="sm:hidden"
                        />
                        <span
                          style={chipStyle(m.color)}
                          className="hidden rounded-full px-2 py-0.5 text-xs font-medium leading-none sm:inline-block"
                        >
                          {m.display_name}
                        </span>
                      </Fragment>
                    ))}
                  </span>
                </span>
              )}
            </span>
          </div>

          {expense.note && (
            <p className="text-xs text-muted-foreground">{expense.note}</p>
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
