import { router } from "expo-router";
import {
  Alert,
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
import { deriveExpenseDraftItems } from "@triplot/shared/import/drafts";
import { buildTripTzTimeline } from "@triplot/shared/schedule";
import {
  deriveAverageRates,
  deriveCategories,
  deriveExpenseFormDefaults,
  deriveOrderedExpenses,
  deriveScheduleEvents,
  toSettlementExpenses,
  toSummaryExpenses,
} from "@triplot/shared/tripDerive";
import type { Currency } from "@triplot/shared/types/database";

import { ExpenseCategoryIcon } from "@/components/expense-category-icon";
import { MemberAvatar, type MemberLite } from "@/components/member-avatar";
import { PlusIcon, XIcon } from "@/components/icons";
import { ColorBadge } from "@/components/color-badge";
import { PrivateBadge } from "@/components/private-badge";
import { PlaceCategoryIcon } from "@/components/place-category-icon";
import { LoadError } from "@/components/load-error";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
import { usePullRefresh } from "@/lib/usePullRefresh";
import {
  useInvalidateInbox,
  useInvalidateTrip,
  useTripDetail,
  useTripDrafts,
} from "@/lib/useTripDetail";
import { useSiblingConfirm } from "@/lib/useSiblingConfirm";
import { useTripId } from "@/lib/useTripId";

// 費用タブ。web の apps/web/app/trips/[tripId]/page.tsx の費用セクション相当。
// 発生順の一覧 + 集計/精算サマリ + 追加/編集フォーム（native formSheet ルート
// trips/[tripId]/expense-form）。メール取り込みの未確定下書きは破線の
// 「未確定の取り込み」ボックスに出し、タップで事前入力済みの確定フォームを
// 開く（× で破棄）。
export default function ExpensesTab() {
  const tripId = useTripId();
  const t = useTranslations();
  const tExp = useTranslations("expense");
  const tImport = useTranslations("import");
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { data, me, loadError, refetch, isRefetching } =
    useTripDetail(tripId);
  const { refreshing, onRefresh } = usePullRefresh(refetch);
  const { data: tripDrafts } = useTripDrafts(tripId);
  const invalidate = useInvalidateTrip(tripId);
  const invalidateInbox = useInvalidateInbox();
  // フックは早期 return より前で呼ぶ（下の loadError / データ未着のガードの
  // 後ろに置くと描画ごとにフックの数が変わって落ちる）。
  const { dismissSiblings } = useSiblingConfirm(tripId, me?.id);

  if (loadError) {
    return (
      <LoadError
        error={loadError}
        onRetry={refetch}
        isRetrying={isRefetching}
      />
    );
  }
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
  // 退会者も含む全員。支払者名と割り勘の対象は退会後も記録として残るので
  // ここで絞ると支払者が空欄になり、精算の金額も釣り合わなくなる。
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

  // 下書き → 事前入力の組み立ては shared（web と共用）。
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

  // 破棄は確定と同じくメール単位（同じメールから出た費用・予定をまとめて）。
  const dismissDraft = (emailId: string) => {
    Alert.alert(tImport("dismissDraftTitle"), tImport("dismissDraftBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: tImport("dismiss"),
        style: "destructive",
        onPress: () => {
          void dismissSiblings([emailId]).then((r) => {
            if (!r.ok) {
              Alert.alert(tImport("dismissFailed", { error: r.error }));
              return;
            }
            void invalidate();
            void invalidateInbox();
          });
        },
      },
    ]);
  };

  const rateHints = Object.entries(averageRates)
    .filter(([c]) => c !== defaultCurrency)
    .map(([c, r]) => `1 ${c} ≈ ${formatRate(r as number)} ${defaultCurrency}`);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
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

        {/* 未確定の取り込み。タップで事前入力済みフォーム、× で破棄。
            **確定した費用の一覧のすぐ上に置く**（画面の先頭ではなく）。仮は
            その兄弟である確定の近くにある方が自然で、旅行一覧の「旅行の候補」
            と同じ置き方に揃う。見た目も揃えて破線・色なし。 */}
        {draftItems.length > 0 && (
          <View style={styles.draftBox}>
            <Text style={styles.draftHeading}>
              {t("tripDetail.pendingImports", { count: draftItems.length })}
            </Text>
            <View style={styles.draftList}>
            {draftItems.map((d, i) => (
              <View
                key={d.id}
                style={[styles.draftRow, i > 0 && styles.draftRowDivider]}
              >
                <Pressable
                  onPress={() =>
                    router.push(`/trips/${tripId}/expense-form?draftId=${d.id}`)
                  }
                  style={styles.draftButton}
                >
                  <View style={styles.draftLabelParts}>
                    {d.labelParts.map((part, i) => (
                      <View key={i} style={styles.draftLabelPart}>
                        {i > 0 && <View style={styles.draftDivider} />}
                        <Text
                          style={styles.draftLabelText}
                          numberOfLines={1}
                        >
                          {part}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.confirmChip}>
                    <Text style={styles.confirmChipText}>
                      {t("common.confirm")}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => dismissDraft(d.emailId)}
                  hitSlop={8}
                  accessibilityLabel={tImport("dismiss")}
                >
                  <XIcon size={16} color={theme.subtleForeground} />
                </Pressable>
              </View>
            ))}
            </View>
          </View>
        )}

        {/* 一覧（発生順）。行の情報は web の ExpenseRowItem と同じ:
            カテゴリ色ピル・金額・外貨・private 鍵・日時・支払・割勘メンバー・
            場所（pin アイコン付き）・メモ。旅行によっては件数が多く並ぶため、
            web の ExpenseList と同じ「1つの枠＋行間は区切り線だけ」（divide-y
            border 相当）にして各行の隙間・二重の枠を無くす（実機フィードバック）。
            バッジ〜割り勘メンバーまでを1つの折り返し行にまとめ、幅が足りる
            端末では自然に2行、狭い端末では3行以上に収まる（明示的な breakpoint
            を置かず、コンテンツ量と幅だけで決まる）。 */}
        {expenses.length > 0 && (
          <View style={styles.expenseListCard}>
            {expenses.map((e, i) => {
              const category = categoryById.get(e.category_id);
              const payer = memberById.get(e.payer_member_id);
              const splitMembers = e.splittable
                ? e.split_member_ids
                    .map((id) => memberById.get(id))
                    .filter((m): m is MemberLite => !!m)
                : null;
              const isForeign = e.local_currency !== defaultCurrency;
              const amountInDefault = e.local_price * e.rate_to_default;
              const placeName = e.place_id
                ? (placeNameById.get(e.place_id) ?? null)
                : null;
              return (
                <Pressable
                  key={e.id}
                  onPress={() =>
                    router.push(
                      `/trips/${tripId}/expense-form?expenseId=${e.id}`,
                    )
                  }
                  style={[styles.expenseRow, i > 0 && styles.expenseRowDivider]}
                >
                  <View style={styles.expenseInfoRow}>
                    <View style={styles.expenseLeftGroup}>
                      {category && (
                        <ColorBadge
                          color={category.color}
                          icon={(glyph) => (
                            <ExpenseCategoryIcon
                              icon={category.icon}
                              size={13}
                              color={glyph}
                            />
                          )}
                        >
                          {category.name}
                        </ColorBadge>
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
                      {e.visibility === "private" && (
                        <PrivateBadge />
                      )}
                    </View>
                    <Text style={styles.metaText}>
                      {formatDateTime(e.paid_at)}
                    </Text>
                  </View>
                  <View style={styles.expenseMetaRow}>
                    <View style={styles.expensePlaceGroup}>
                      {placeName && (
                        <View style={styles.placeRow}>
                          <PlaceCategoryIcon
                            icon="pin"
                            size={12}
                            color={theme.mutedForeground}
                          />
                          <Text style={styles.metaText} numberOfLines={1}>
                            {placeName}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.expensePayerGroup}>
                      <View style={styles.metaGroup}>
                        <Text style={styles.metaText}>
                          {tExp("paidLabel")}
                        </Text>
                        {payer && <MemberAvatar member={payer} size={16} />}
                      </View>
                      {splitMembers && splitMembers.length > 0 && (
                        <View style={styles.metaGroup}>
                          <Text style={styles.metaText}>
                            {tExp("splitLabel")}
                          </Text>
                          {splitMembers.map((m) => (
                            <MemberAvatar key={m.id} member={m} size={16} />
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                  {e.note ? (
                    // 一覧の可変長テキストは1行で止める（ui-guidelines「切り詰め」）。
                    // 取り込みが入れるメモは1行に収まる長さで書かせているが、
                    // 手入力は自由なのでここでも止める。
                    <Text style={styles.metaText} numberOfLines={1}>
                      {e.note}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}

        {expenses.length === 0 && (
          <Text style={styles.empty}>{tExp("empty")}</Text>
        )}
      </ScrollView>

      {/* 追加 FAB */}
      <Pressable
        onPress={() => router.push(`/trips/${tripId}/expense-form`)}
        style={styles.fab}
        accessibilityLabel={tExp("addAria")}
      >
        <PlusIcon size={24} color={theme.primaryForeground} />
      </Pressable>
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
  const styles = useThemedStyles(makeStyles);
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

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.background },
  content: { padding: 16, gap: 8, paddingBottom: 96 },
  // 未確定の取り込み。仮のもの（仮費用・仮旅行）は破線の枠で示し、色は付けない。破線＝
  // 「まだ実体が無い／押すと実体ができる」で、旅行一覧の「旅行の候補」と
  // 同じ言語に揃える（ui-guidelines「定型部品」の破線ボーダー）。
  // 見出しは器の外（確定の一覧が「費用」の見出しの外にあるのと同じ関係）。
  // 確定の一覧とは別のまとまりなので境目は 24px。
  draftBox: { marginBottom: 24 },
  draftHeading: { fontSize: 12, color: t.mutedForeground, marginBottom: 4 },
  // 破線の器はここ（見出しの外＝行だけを囲う）。
  // 付けると枠の中に枠ができて、他の一覧から浮く（ui-guidelines「行にするか
  // カードにするか」の「意味が群に付いているなら囲いを群の側に置く」）。
  draftList: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: t.fgAlpha(0.2),
    borderRadius: 6,
  },
  // 左右の余白は行が持つ（区切り線を器の端まで引くため）。
  draftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  draftRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.fgAlpha(0.1),
  },
  // padding は行（draftRow）が持つ。ここにも付けると二重になって、
  // 店名と日付に使える幅が減り省略が増える。
  draftButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  draftLabelParts: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  draftLabelPart: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  // 横並び要素の区切りは縦棒（web の InlineDivider と同じ 1px・foreground/10）。
  draftDivider: { width: 1, height: 12, backgroundColor: t.fgAlpha(0.1) },
  draftLabelText: { fontSize: 14, flexShrink: 1, color: t.foreground },
  confirmChip: {
    borderRadius: 4,
    backgroundColor: t.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  confirmChipText: { fontSize: 11, fontWeight: "500", color: t.primaryForeground },
  summaryGrid: {
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderColor: t.fgAlpha(0.1),
    borderRadius: 6,
    padding: 16,
  },
  summaryCell: { flex: 1 },
  summaryLabel: { fontSize: 12, color: t.mutedForeground },
  summaryValue: { marginTop: 4, fontSize: 14, fontWeight: "500", color: t.foreground },
  summaryValueLg: { marginTop: 4, fontSize: 18, fontWeight: "600", color: t.foreground },
  card: {
    borderWidth: 1,
    borderColor: t.fgAlpha(0.1),
    borderRadius: 6,
    padding: 16,
    gap: 6,
    marginBottom: 8,
  },
  cardTitle: { fontSize: 14, fontWeight: "500", color: t.foreground },
  muted: { fontSize: 14, color: t.mutedForeground },
  settlementRow: { fontSize: 14, color: t.mutedForeground },
  settlementName: { fontWeight: "500", color: t.foreground },
  rateHint: { marginTop: 6, fontSize: 12, color: t.mutedForeground },
  // 一覧全体を1つの枠にし（web の ExpenseList の <ul> と同じ）、行同士は
  // 区切り線（expenseRowDivider）だけで分ける。行ごとに枠＋隙間を持たせると
  // 件数が多い旅行で無駄に縦長になっていた（実機フィードバック）。
  expenseListCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.fgAlpha(0.12),
    borderRadius: 6,
    overflow: "hidden",
  },
  expenseRow: {
    padding: 12,
    gap: 4,
  },
  expenseRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.fgAlpha(0.1),
  },
  // 1行目＝カテゴリ/金額（左）＋日時（右）、2行目＝場所（左）＋支払/割り勘
  // （右）の2行構成（web の ExpenseRowItem と同じ情報を意味のまとまりで
  // 左右に分けて詰める）。場所と支払は「行き先と誰が払ったか」で同じ行に
  // まとめるのが自然という実機フィードバックを受けて2行目に統合。
  expenseInfoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  expenseLeftGroup: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  expenseMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  expensePlaceGroup: {
    flex: 1,
    minWidth: 0,
  },
  expensePayerGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  metaGroup: { flexDirection: "row", alignItems: "center", gap: 4 },
  placeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  amount: { fontSize: 14, fontWeight: "500", color: t.foreground },
  foreign: { fontSize: 12, color: t.mutedForeground },
  metaText: { fontSize: 12, color: t.mutedForeground },
  empty: { padding: 24, fontSize: 14, color: t.mutedForeground },
  fab: {
    position: "absolute",
    right: 20,
    // NativeTabs（iOS 26 Liquid Glass の浮島タブバー）は RN の zIndex より
    // 上のネイティブ合成レイヤーに乗るため、bottom:28 だと FAB が丸ごと
    // タブバーのヒット領域に隠れてタップが奪われる（実機/シミュレータで
    // 確認・タブバー上端は画面下端から実測 約83pt）。タブバーより確実に
    // 上に出す値へ引き上げる。
    bottom: 100,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
