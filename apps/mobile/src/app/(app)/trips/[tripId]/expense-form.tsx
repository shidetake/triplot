import { router, useLocalSearchParams } from "expo-router";
import { Alert, ScrollView } from "react-native";
import { useTranslations } from "use-intl";

import { resolveInboundDraft } from "@triplot/shared/data/inbox";
import { deriveExpenseDraftItems } from "@triplot/shared/import/drafts";
import {
  buildTripTzTimeline,
  resolveEventTz,
} from "@triplot/shared/schedule";
import { tripBiasCenter } from "@triplot/shared/tripBias";
import {
  deriveAverageRates,
  deriveCategories,
  deriveExpenseFormDefaults,
  deriveOrderedExpenses,
  deriveScheduleEvents,
} from "@triplot/shared/tripDerive";
import type { Currency } from "@triplot/shared/types/database";

import { ExpenseForm } from "@/components/expense-form";
import { FormHostProvider } from "@/components/form-host";
import { supabase } from "@/lib/supabase";
import { useSiblingConfirm } from "@/lib/useSiblingConfirm";
import {
  useInvalidateInbox,
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
  const invalidateInbox = useInvalidateInbox();

  // フックは早期 return より前で呼ぶ（ガードの後ろに置くと描画ごとに
  // フックの数が変わって落ちる）。
  const { confirmSiblings } = useSiblingConfirm(tripId, me?.id);

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
  // 選べるのは今この旅行にいる人だけ（退会者は候補に出さない）。
  const members = (data.members ?? [])
    .filter((m) => m.left_at === null)
    .map((m) => ({
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
    tzTimeline,
  });

  // 場所欄の Google サジェストの地理バイアス。**その費用の日時に「どこにいたか」**
  // を旅程から引く（tripBiasCenter）。旅行に1つの中心を持たせると、成田 →
  // ホノルルと動く旅行で成田の昼食をホノルルで引いて外す。移動が1つも無ければ
  // 旅行のピンの中心に落ち、それも無ければ無バイアス（地図タブと違い Tokyo には
  // フォールバックしない）。
  // 時刻は下書きに無いことがあるので、日付の正午を代表値にする（移動の前後の
  // どちらに入るかは日単位で決まるので、これで十分）。
  const biasTarget = defaults?.initialPaidAt
    ? {
        at: `${defaults.initialPaidAt}T12:00`,
        tz: resolveEventTz(defaults.initialPaidAt, null, null, tzTimeline),
      }
    : null;
  const biasCenter = tripBiasCenter({
    events: scheduleEvents,
    places: data.placesRaw ?? [],
    drafts: tripDrafts ?? null,
    target: biasTarget,
  });

  const editExpense = expenseId
    ? expenses.find((e) => e.id === expenseId)
    : undefined;
  const confirmingDraft = draftId
    ? draftItems.find((d) => d.id === draftId)
    : undefined;

  // 取り込み下書きの確定。ExpenseForm 成功時に呼ばれ、下書きを confirmed に
  // する（web の DraftConfirmButton と同じ resolveInboundDraft）。この旅行の
  // 未確定が全部片付くと親メールも DB 側で自動的に確定扱いになるので、受信箱の
  // キャッシュも合わせて無効化する（useInvalidateInbox 参照）。
  // 同じメールから出た予定の下書きも一緒に確定する（1通のメールはたいてい
  // 費用と予定の両方を産むので、片方だけ確定すると相方が残る）。
  const confirmDraft = async (id: string, newExpenseId?: string) => {
    const r = await resolveInboundDraft(supabase, id, "confirmed", {
      expenseId: newExpenseId,
    });
    if (!r.ok) Alert.alert(r.error);
    const emailId = draftItems.find((d) => d.id === id)?.emailId;
    if (emailId) await confirmSiblings([emailId], [id]);
    void invalidate();
    void invalidateInbox();
  };

  // 入力途中を保持するキー（web の add-expense-button / expense-list と同じ
  // 体系）。取り込み下書きの確定は下書きごと、編集は費用ごと、新規は旅行ごと。
  const draftKey = draftId
    ? `expense:import:${draftId}`
    : expenseId
      ? `expense:edit:${expenseId}`
      : `expense:new:${tripId}`;

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <FormHostProvider draftKey={draftKey}>
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
          biasCenter={biasCenter}
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
      </FormHostProvider>
    </ScrollView>
  );
}
