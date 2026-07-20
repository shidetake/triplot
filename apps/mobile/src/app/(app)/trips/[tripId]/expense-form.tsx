import { router, useLocalSearchParams } from "expo-router";
import { Alert, ScrollView } from "react-native";
import { useTranslations } from "use-intl";

import { resolveInboundDraft } from "@triplot/shared/data/inbox";
import { deriveExpenseDraftItems } from "@triplot/shared/import/drafts";
import { buildTripTzTimeline } from "@triplot/shared/schedule";
import {
  deriveAverageRates,
  deriveCategories,
  deriveExpenseFormDefaults,
  deriveOrderedExpenses,
  deriveScheduleEvents,
} from "@triplot/shared/tripDerive";
import type { Currency } from "@triplot/shared/types/database";

import { ExpenseForm } from "@/components/expense-form";
import { supabase } from "@/lib/supabase";
import {
  useInvalidateTrip,
  useTripDetail,
  useTripDrafts,
} from "@/lib/useTripDetail";
import { useTripId } from "@/lib/useTripId";

// 費用の追加/編集（native formSheet ルート）。費用タブから router.push で開く。
// expenseId=編集対象／draftId=取り込み下書きの確定（すべて省略なら新規追加）。
export default function ExpenseFormRoute() {
  const tripId = useTripId();
  const { expenseId, draftId } = useLocalSearchParams<{
    expenseId?: string;
    draftId?: string;
  }>();
  const t = useTranslations();
  const { data, me } = useTripDetail(tripId);
  const { data: tripDrafts } = useTripDrafts(tripId);
  const invalidate = useInvalidateTrip(tripId);

  if (!data?.trip || !me) return null;
  const trip = data.trip;

  const defaultCurrency = trip.default_currency as Currency;
  const categories = deriveCategories(data.categoriesRaw);
  const scheduleEvents = deriveScheduleEvents(data.eventsRaw, data.todosRaw);
  const tzTimeline = buildTripTzTimeline(
    scheduleEvents,
    trip.default_timezone,
  );
  const expenses = deriveOrderedExpenses(data.expensesRaw, tzTimeline);
  const averageRates = deriveAverageRates(expenses, defaultCurrency);
  const members = (data.members ?? []).map((m) => ({
    id: m.id,
    display_name: m.display_name,
    color: m.color,
  }));

  const today = new Date().toISOString().slice(0, 10);
  const defaults = deriveExpenseFormDefaults(
    expenses,
    categories,
    defaultCurrency,
    trip.start_date,
    today,
  );

  const draftItems = deriveExpenseDraftItems(tripDrafts ?? null, {
    categories,
    defaultCurrency,
    fallbackCategoryId: defaults.initialCategoryId,
    places: (data.placesRaw ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      formattedAddress: p.formatted_address,
    })),
    unknownMerchantLabel: t("tripDetail.unknownMerchant"),
  });

  const editExpense = expenseId
    ? expenses.find((e) => e.id === expenseId)
    : undefined;
  const confirmingDraft = draftId
    ? draftItems.find((d) => d.id === draftId)
    : undefined;

  // 取り込み下書きの確定。ExpenseForm 成功時に呼ばれ、下書きを confirmed に
  // する（web の DraftConfirmButton と同じ resolveInboundDraft）。
  const confirmDraft = async (id: string, newExpenseId?: string) => {
    const r = await resolveInboundDraft(supabase, id, "confirmed", {
      expenseId: newExpenseId,
    });
    if (!r.ok) Alert.alert(r.error);
    void invalidate();
  };

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <ExpenseForm
        tripId={tripId}
        members={members}
        myMemberId={me.id}
        defaultCurrency={defaultCurrency}
        initialCurrency={defaults.initialCurrency}
        categories={categories}
        initialCategoryId={defaults.initialCategoryId}
        averageRates={averageRates}
        initialPaidAt={defaults.initialPaidAt}
        places={(data.placesRaw ?? []).map((p) => ({
          id: p.id,
          name: p.name,
        }))}
        tzTimeline={tzTimeline}
        editExpense={editExpense}
        draft={confirmingDraft}
        onDone={() => {
          router.back();
          void invalidate();
        }}
        onSuccess={
          confirmingDraft
            ? (newExpenseId) =>
                void confirmDraft(confirmingDraft.id, newExpenseId)
            : undefined
        }
      />
    </ScrollView>
  );
}
