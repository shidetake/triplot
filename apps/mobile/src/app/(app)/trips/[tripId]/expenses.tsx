import { useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTranslations } from "use-intl";

import { calculateExpenseSummary } from "@triplot/shared/expenseSummary";
import { calculateSettlements } from "@triplot/shared/settlement";
import { formatAmount } from "@triplot/shared/formatAmount";
import { formatRate } from "@triplot/shared/formatRate";
import { buildTripTzTimeline } from "@triplot/shared/schedule";
import {
  deriveAverageRates,
  deriveCategories,
  deriveExpenseFormDefaults,
  deriveOrderedExpenses,
  deriveScheduleEvents,
  toSettlementExpenses,
  toSummaryExpenses,
  type ExpenseRow,
} from "@triplot/shared/tripDerive";
import type { Currency } from "@triplot/shared/types/database";

import { ExpenseCategoryIcon } from "@/components/expense-category-icon";
import { ExpenseForm } from "@/components/expense-form";
import { FormSheet, type FormSheetRef } from "@/components/form-sheet";
import { MemberAvatar, type MemberLite } from "@/components/member-avatar";
import { PlusIcon } from "@/components/icons";
import { useInvalidateTrip, useTripDetail } from "@/lib/useTripDetail";

// 費用タブ。web の apps/web/app/trips/[tripId]/page.tsx の費用セクション相当。
// 発生順の一覧 + 集計/精算サマリ + 追加/編集フォーム（ボトムシート）。
export default function ExpensesTab() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const t = useTranslations();
  const tExp = useTranslations("expense");
  const { data, me, refetch, isRefetching } = useTripDetail(tripId);
  const invalidate = useInvalidateTrip(tripId);

  const sheetRef = useRef<FormSheetRef>(null);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);

  if (!data?.trip || !me) return null;

  const defaultCurrency = data.trip.default_currency as Currency;
  const categories = deriveCategories(data.categoriesRaw);
  const scheduleEvents = deriveScheduleEvents(data.eventsRaw, data.todosRaw);
  const tzTimeline = buildTripTzTimeline(
    scheduleEvents,
    data.trip.default_timezone,
  );
  const expenses = deriveOrderedExpenses(data.expensesRaw, tzTimeline);
  const averageRates = deriveAverageRates(expenses, defaultCurrency);
  const members: MemberLite[] = (data.members ?? []).map((m) => ({
    id: m.id,
    display_name: m.display_name,
    color: m.color,
    avatarUrl: m.users?.avatar_url ?? null,
  }));
  const memberById = new Map(members.map((m) => [m.id, m]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const placeNameById = new Map(
    (data.placesRaw ?? []).map((p) => [p.id, p.name]),
  );

  const summary = calculateExpenseSummary(toSummaryExpenses(expenses), me.id);
  const settlements = calculateSettlements(
    toSettlementExpenses(expenses),
    members.map((m) => ({ id: m.id })),
  );

  const today = new Date().toISOString().slice(0, 10);
  const defaults = deriveExpenseFormDefaults(
    expenses,
    categories,
    defaultCurrency,
    data.trip.start_date,
    today,
  );

  const openForm = (row: ExpenseRow | null) => {
    setEditing(row);
    sheetRef.current?.present();
  };

  const rateHints = Object.entries(averageRates)
    .filter(([c]) => c !== defaultCurrency)
    .map(([c, r]) => `1 ${c} ≈ ${formatRate(r as number)} ${defaultCurrency}`);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
          />
        }
      >
        {/* 集計（自己負担 / private / 合計） */}
        <View style={styles.summaryGrid}>
          <SummaryCell
            label={t("tripDetail.expenseSummarySharedSelf")}
            value={summary.sharedSelfShare}
            currency={defaultCurrency}
          />
          <SummaryCell
            label={t("tripDetail.expenseSummaryPrivate")}
            value={summary.privateTotal}
            currency={defaultCurrency}
          />
          <SummaryCell
            label={t("tripDetail.expenseSummaryTotal")}
            value={summary.total}
            currency={defaultCurrency}
            emphasized
          />
        </View>

        {/* 精算 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {t("tripDetail.expenseSummarySettlement")}
          </Text>
          {settlements.length === 0 ? (
            <Text style={styles.muted}>—</Text>
          ) : (
            settlements.map((s, i) => (
              <Text key={i} style={styles.settlementRow}>
                <Text style={styles.settlementName}>
                  {memberById.get(s.fromMemberId)?.display_name ?? "?"}
                </Text>
                {"  →  "}
                <Text style={styles.settlementName}>
                  {memberById.get(s.toMemberId)?.display_name ?? "?"}
                </Text>
                {"   "}
                {formatAmount(s.amount, defaultCurrency)}
              </Text>
            ))
          )}
          {rateHints.length > 0 && (
            <Text style={styles.rateHint}>
              {t("tripDetail.expenseSummaryAverageRate", {
                rates: rateHints.join(", "),
              })}
            </Text>
          )}
        </View>

        {/* 一覧（発生順） */}
        {expenses.map((e) => {
          const category = categoryById.get(e.category_id);
          const payer = memberById.get(e.payer_member_id);
          const isForeign = e.local_currency !== defaultCurrency;
          const amountInDefault = e.local_price * e.rate_to_default;
          const placeName = e.place_id
            ? (placeNameById.get(e.place_id) ?? null)
            : null;
          return (
            <Pressable
              key={e.id}
              onPress={() => openForm(e)}
              style={styles.expenseRow}
            >
              <View style={styles.expenseTop}>
                {category && (
                  <View style={styles.categoryBadge}>
                    <ExpenseCategoryIcon
                      icon={category.icon}
                      size={13}
                      color={category.color}
                    />
                    <Text style={styles.categoryName}>{category.name}</Text>
                  </View>
                )}
                <Text style={styles.amount}>
                  {formatAmount(amountInDefault, defaultCurrency)}
                </Text>
                {isForeign && (
                  <Text style={styles.foreign}>
                    ({formatAmount(e.local_price, e.local_currency)} @{" "}
                    {formatRate(e.rate_to_default)})
                  </Text>
                )}
              </View>
              <View style={styles.expenseMeta}>
                <Text style={styles.metaText}>{formatDateTime(e.paid_at)}</Text>
                <Text style={styles.metaText}>{tExp("paidLabel")}</Text>
                {payer && <MemberAvatar member={payer} size={16} />}
                {placeName && (
                  <Text style={styles.metaText} numberOfLines={1}>
                    {placeName}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}

        {expenses.length === 0 && (
          <Text style={styles.empty}>まだ費用がありません。</Text>
        )}
      </ScrollView>

      {/* 追加 FAB */}
      <Pressable
        onPress={() => openForm(null)}
        style={styles.fab}
        accessibilityLabel={tExp("addAria")}
      >
        <PlusIcon size={24} color="#fff" />
      </Pressable>

      <FormSheet ref={sheetRef}>
        {(dismiss) => (
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
            editExpense={editing ?? undefined}
            onDone={() => {
              dismiss();
              void invalidate();
            }}
          />
        )}
      </FormSheet>
    </View>
  );
}

function SummaryCell({
  label,
  value,
  currency,
  emphasized,
}: {
  label: string;
  value: number;
  currency: Currency;
  emphasized?: boolean;
}) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={emphasized ? styles.summaryValueLg : styles.summaryValue}>
        {formatAmount(value, currency)}
      </Text>
    </View>
  );
}

// web の expense-list.tsx の formatDateTime と同じ（0:00 は日付のみ）。
function formatDateTime(iso: string): string {
  const [, mo, d] = iso.slice(0, 10).split("-").map(Number);
  const hhmm = iso.slice(11, 16);
  return hhmm === "00:00" ? `${mo}/${d}` : `${mo}/${d} ${hhmm}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, gap: 8, paddingBottom: 96 },
  summaryGrid: {
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: 6,
    padding: 16,
  },
  summaryCell: { flex: 1 },
  summaryLabel: { fontSize: 12, color: "rgba(0,0,0,0.6)" },
  summaryValue: { marginTop: 4, fontSize: 14, fontWeight: "500" },
  summaryValueLg: { marginTop: 4, fontSize: 18, fontWeight: "600" },
  card: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: 6,
    padding: 16,
    gap: 6,
    marginBottom: 8,
  },
  cardTitle: { fontSize: 14, fontWeight: "500" },
  muted: { fontSize: 14, color: "rgba(0,0,0,0.6)" },
  settlementRow: { fontSize: 14, color: "rgba(0,0,0,0.6)" },
  settlementName: { fontWeight: "500", color: "#000" },
  rateHint: { marginTop: 6, fontSize: 12, color: "rgba(0,0,0,0.6)" },
  expenseRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: 6,
    padding: 12,
    gap: 4,
  },
  expenseTop: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  categoryName: { fontSize: 12, color: "rgba(0,0,0,0.7)" },
  amount: { fontSize: 14, fontWeight: "500" },
  foreign: { fontSize: 12, color: "rgba(0,0,0,0.6)" },
  expenseMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  metaText: { fontSize: 12, color: "rgba(0,0,0,0.6)" },
  empty: { padding: 24, fontSize: 14, color: "rgba(0,0,0,0.6)" },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#09090b",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
