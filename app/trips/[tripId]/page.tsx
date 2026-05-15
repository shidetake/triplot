import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { type Category, ExpenseForm } from "@/components/expense-form";
import { ExpenseList, type ExpenseRow } from "@/components/expense-list";
import { ExpenseSummaryView } from "@/components/expense-summary";
import {
  calculateExpenseSummary,
  type SummaryExpense,
} from "@/lib/expenseSummary";
import {
  calculateSettlements,
  type SettlementExpense,
} from "@/lib/settlement";
import { createClient } from "@/lib/supabase/server";
import type { Currency, Visibility } from "@/lib/types/database";

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

  const { data: categoriesRaw } = await supabase
    .from("expense_categories")
    .select("id, name, color, emoji, sort_order")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true });

  const categories: Category[] = categoriesRaw ?? [];

  const { data: expensesRaw } = await supabase
    .from("expenses")
    .select(
      "id, local_price, local_currency, rate_to_default, category_id, visibility, splittable, note, paid_at, payer_member_id, created_by_member_id, expense_splits(member_id)",
    )
    .eq("trip_id", tripId)
    .order("paid_at", { ascending: false });

  // gen-types は CHECK 制約を読めず string を返すので、DB 境界でドメイン型に絞る
  const defaultCurrency = trip.default_currency as Currency;

  const expenses: ExpenseRow[] = (expensesRaw ?? []).map((e) => ({
    id: e.id,
    local_price: Number(e.local_price),
    local_currency: e.local_currency as Currency,
    rate_to_default: Number(e.rate_to_default),
    category_id: e.category_id,
    visibility: e.visibility as Visibility,
    splittable: e.splittable,
    note: e.note,
    paid_at: e.paid_at,
    payer_member_id: e.payer_member_id,
    created_by_member_id: e.created_by_member_id,
    split_member_ids: (e.expense_splits ?? []).map((s) => s.member_id),
  }));

  // 通貨ごとの平均レート（フォームのデフォルトと表示用）
  const ratesByCurrency = new Map<Currency, number[]>();
  for (const e of expenses) {
    const arr = ratesByCurrency.get(e.local_currency) ?? [];
    arr.push(e.rate_to_default);
    ratesByCurrency.set(e.local_currency, arr);
  }
  const averageRates: Partial<Record<Currency, number>> = {};
  for (const [c, rates] of ratesByCurrency) {
    averageRates[c] = rates.reduce((s, r) => s + r, 0) / rates.length;
  }
  // default_currency は常に 1
  averageRates[defaultCurrency] = 1;

  // Settlement / Summary 用に default_currency に換算済みで渡す
  const settlementExpenses: SettlementExpense[] = expenses
    .filter((e) => e.visibility === "shared" && e.splittable)
    .map((e) => ({
      id: e.id,
      amount: e.local_price * e.rate_to_default,
      payerMemberId: e.payer_member_id,
      splitMemberIds: e.split_member_ids,
    }));

  const settlements = calculateSettlements(
    settlementExpenses,
    activeMembers.map((m) => ({ id: m.id })),
  );

  const summaryExpenses: SummaryExpense[] = expenses.map((e) => ({
    visibility: e.visibility,
    amountInDefault: e.local_price * e.rate_to_default,
    payerMemberId: e.payer_member_id,
    splittable: e.splittable,
    splitMemberIds: e.split_member_ids,
    createdByMemberId: e.created_by_member_id,
  }));

  const summary = calculateExpenseSummary(summaryExpenses, me.id);

  const today = new Date().toISOString().slice(0, 10);
  const defaultPaidAt =
    trip.start_date && today < trip.start_date
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
          defaultCurrency={defaultCurrency}
          averageRates={averageRates}
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
              defaultCurrency={defaultCurrency}
              categories={categories}
              averageRates={averageRates}
              defaultPaidAt={defaultPaidAt}
            />
          </div>
        </details>

        <ExpenseList
          tripId={tripId}
          expenses={expenses}
          members={activeMembers}
          categories={categories}
          defaultCurrency={defaultCurrency}
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
