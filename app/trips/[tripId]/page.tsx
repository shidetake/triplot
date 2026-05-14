import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ExpenseForm } from "@/components/expense-form";
import { ExpenseList, type ExpenseRow } from "@/components/expense-list";
import { ExpenseSummaryView } from "@/components/expense-summary";
import type { ExchangeRates } from "@/lib/currency";
import {
  calculateExpenseSummary,
  type SummaryExpense,
} from "@/lib/expenseSummary";
import {
  calculateSettlements,
  type SettlementExpense,
} from "@/lib/settlement";
import { convertToDefault } from "@/lib/currency";
import { createClient } from "@/lib/supabase/server";
import type { Currency } from "@/lib/types/database";

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: trip, error } = await supabase
    .from("trips")
    .select("id, title, start_date, end_date, status, default_currency")
    .eq("id", tripId)
    .single();

  if (error || !trip) notFound();

  const { data: members } = await supabase
    .from("trip_members")
    .select("id, user_id, display_name, kind, color")
    .eq("trip_id", tripId)
    .is("left_at", null)
    .order("joined_at", { ascending: true });

  const activeMembers = members ?? [];
  const me = activeMembers.find((m) => m.user_id === user.id);
  if (!me) notFound();

  const { data: ratesRows } = await supabase
    .from("trip_exchange_rates")
    .select("currency, rate_to_default")
    .eq("trip_id", tripId);

  const rates: ExchangeRates = {};
  for (const r of ratesRows ?? []) {
    rates[r.currency as Currency] = Number(r.rate_to_default);
  }

  const { data: expensesRaw } = await supabase
    .from("expenses")
    .select(
      "id, amount, currency, visibility, splittable, note, paid_at, payer_member_id, created_by_member_id, expense_splits(member_id)",
    )
    .eq("trip_id", tripId)
    .order("paid_at", { ascending: false });

  const expenses: ExpenseRow[] = (expensesRaw ?? []).map((e) => ({
    id: e.id,
    amount: Number(e.amount),
    currency: e.currency,
    visibility: e.visibility,
    splittable: e.splittable,
    note: e.note,
    paid_at: e.paid_at,
    payer_member_id: e.payer_member_id,
    created_by_member_id: e.created_by_member_id,
    split_member_ids: (e.expense_splits ?? []).map((s) => s.member_id),
  }));

  // Settlement / Summary 用に shared & splittable な費用だけを default_currency に換算して渡す
  const settlementExpenses: SettlementExpense[] = expenses
    .filter((e) => e.visibility === "shared" && e.splittable)
    .map((e) => ({
      id: e.id,
      amount: convertToDefault(e.amount, e.currency, rates),
      payerMemberId: e.payer_member_id,
      splitMemberIds: e.split_member_ids,
    }));

  const settlements = calculateSettlements(
    settlementExpenses,
    activeMembers.map((m) => ({ id: m.id })),
  );

  const summaryExpenses: SummaryExpense[] = expenses.map((e) => ({
    visibility: e.visibility,
    amount: e.amount,
    currency: e.currency,
    payerMemberId: e.payer_member_id,
    splittable: e.splittable,
    splitMemberIds: e.split_member_ids,
    createdByMemberId: e.created_by_member_id,
  }));

  const summary = calculateExpenseSummary(summaryExpenses, me.id, rates);

  const availableCurrencies: Currency[] = ["JPY", "USD"].filter(
    (c): c is Currency =>
      c === trip.default_currency || rates[c as Currency] !== undefined,
  );

  // 日付デフォルトは「旅行期間内なら start_date、それ以外は今日」
  const today = new Date().toISOString().slice(0, 10);
  const defaultPaidAt =
    trip.start_date && trip.end_date && today < trip.start_date
      ? trip.start_date
      : trip.end_date && today > trip.end_date
        ? trip.end_date
        : today;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← 旅行一覧に戻る
      </Link>

      <header className="mt-4">
        <h1 className="text-2xl font-semibold">{trip.title}</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {trip.start_date ?? "?"} 〜 {trip.end_date ?? "?"}・通貨:{" "}
          {trip.default_currency}・状態: {trip.status}
        </p>
      </header>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-zinc-700">メンバー</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {activeMembers.map((m) => (
            <li
              key={m.id}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-sm"
            >
              <span>{m.display_name}</span>
              <span className="text-xs text-zinc-500">({m.kind})</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 space-y-6">
        <h2 className="text-lg font-medium">費用</h2>

        <ExpenseSummaryView
          summary={summary}
          settlements={settlements}
          members={activeMembers}
          defaultCurrency={trip.default_currency}
          rates={rates}
        />

        <details className="rounded-md border border-zinc-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            費用を追加
          </summary>
          <div className="border-t border-zinc-200 p-4">
            <ExpenseForm
              tripId={tripId}
              members={activeMembers.map((m) => ({
                id: m.id,
                display_name: m.display_name,
              }))}
              myMemberId={me.id}
              defaultCurrency={trip.default_currency}
              availableCurrencies={availableCurrencies}
              defaultPaidAt={defaultPaidAt}
            />
          </div>
        </details>

        <ExpenseList
          tripId={tripId}
          expenses={expenses}
          members={activeMembers}
          myMemberId={me.id}
        />
      </section>

      <section className="mt-12 grid gap-3 text-sm text-zinc-500">
        <p>TODO: 地図・ピン管理</p>
        <p>TODO: スケジュール（週ビュー）</p>
        <p>TODO: 共有リンクの発行とゲスト参加</p>
      </section>
    </main>
  );
}
