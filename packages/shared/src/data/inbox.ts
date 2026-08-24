import {
  deriveEventDraftItems,
  deriveExpenseDraftItems,
  type PendingDraft,
} from "../import/drafts";
import type { TripPlace } from "../import/placeMatch";
import {
  eventFieldsFromDraft,
  type ExpenseAutoContext,
  expenseFieldsFromDraft,
} from "../import/siblingConfirm";
import { buildTripTzTimeline, type TripTzTimeline } from "../schedule";
import {
  deriveAverageRates,
  deriveCategories,
  deriveExpenseFormDefaults,
  deriveOrderedExpenses,
  derivePlaces,
  deriveScheduleEvents,
} from "../tripDerive";
import type { Currency } from "../types/database";

import type { DB } from "./client";
import { createEvent } from "./events";
import { createExpense } from "./expenses";
import { fetchTripDetailRows } from "./reads/tripDetail";
import { err, ok, type Result } from "./result";

// 取り込み（受信メール下書き）の操作。権限は各 RPC が auth.uid() を確認。

// 下書き（費用/予定の1項目）を確定/破棄する。確定時は作成した費用/予定の id を紐づける。
// 親メールの全項目が解決されるとメール自体も自動で確定/破棄される（RPC 側）。
export async function resolveInboundDraft(
  sb: DB,
  draftId: string,
  status: "confirmed" | "dismissed",
  ids: { expenseId?: string; eventId?: string } = {},
): Promise<Result<void>> {
  const { error } = await sb.rpc("resolve_inbound_draft", {
    p_id: draftId,
    p_status: status,
    // gen-types は nullable 引数を string にする癖。
    p_expense_id: (ids.expenseId ?? null) as unknown as string,
    p_event_id: (ids.eventId ?? null) as unknown as string,
  });
  if (error) return err(error.message);
  return ok(undefined);
}

// 重なった同一店の下書きをまとめて表示している場合、確定/破棄では**畳んだぶんも
// 全部**解決する。1件しか解決しないと、残りが未確定のまま再び現れる
// （import/draftOverlap.ts の resolveDraftOverlaps 参照）。
export async function resolveInboundDrafts(
  sb: DB,
  draftIds: string[],
  status: "confirmed" | "dismissed",
  ids: { expenseId?: string; eventId?: string } = {},
): Promise<Result<void>> {
  for (const id of draftIds) {
    const r = await resolveInboundDraft(sb, id, status, ids);
    if (!r.ok) return r;
  }
  return ok(undefined);
}

// 旅行の状態から、下書きをそのまま費用/予定にするのに要る文脈を組み立てる。
// **旅行画面が下書きを表示するときと同じ導出**（apps/web/app/trips/[tripId]/
// page.tsx・RN の useTripDetail）を使う ＝ 自動で作った結果と、フォームを
// 開いて何も触らず保存した結果が一致する。
async function loadSiblingConfirmContext(
  sb: DB,
  tripId: string,
  myMemberId: string,
): Promise<
  Result<
    ExpenseAutoContext & {
      categories: { id: string; name: string }[];
      fallbackCategoryId: string;
      places: TripPlace[];
      tzTimeline: TripTzTimeline;
    }
  >
> {
  const { trip, tripError, members, categoriesRaw, expensesRaw, placesRaw, eventsRaw, todosRaw } =
    await fetchTripDetailRows(sb, tripId);
  if (tripError || !trip) return err(tripError?.message ?? "trip not found");

  const defaultCurrency = trip.default_currency as Currency;
  const categories = deriveCategories(categoriesRaw);
  const tzTimeline = buildTripTzTimeline(
    deriveScheduleEvents(eventsRaw, todosRaw),
    trip.default_timezone,
  );
  const expenses = deriveOrderedExpenses(expensesRaw, tzTimeline);
  const today = new Date().toISOString().slice(0, 10);
  const { initialCategoryId } = deriveExpenseFormDefaults(
    expenses,
    categories,
    defaultCurrency,
    trip.start_date,
    today,
  );
  return ok({
    defaultCurrency,
    averageRates: deriveAverageRates(expenses, defaultCurrency),
    myMemberId,
    // 割り勘の既定は「全員」＝今この旅行に居る人（退会者は含めない）。
    activeMemberIds: (members ?? [])
      .filter((m) => m.left_at === null)
      .map((m) => m.id),
    categories,
    fallbackCategoryId: initialCategoryId,
    places: derivePlaces(placesRaw).map((p) => ({
      id: p.id,
      name: p.name,
      formattedAddress: p.formatted_address,
    })),
    tzTimeline,
  });
}

// 連動確定に要る文言。旅行のデータ（カテゴリ・場所・旅程・レート履歴）は
// この関数が自分で読むので、呼び出し側が渡すのは翻訳カタログ由来のものだけ
// （shared は i18n を知らない）。web と RN で組み立てを二重に持たないため。
export type SiblingConfirmLabels = {
  locale: string;
  untitledLabel: string;
  unknownMerchantLabel: string;
  reservationRefLabel: (ref: string) => string;
};

export type SiblingConfirmResult = {
  expenses: number;
  events: number;
  // レートが決められず自動で作れなかった費用の下書き（呼び出し側がその
  // フォームへ送る）。
  needsRateDraftId: string | null;
};

// 確定した下書きと同じメールから出た**残りの下書きを全部確定する**。
// 相方の費用/予定を下書きの既定値で実際に作り、その id を紐づけて
// confirmed にする（「確定」はフラグを立てることではなく記録を作ること）。
//
// excludeDraftIds には今まさに確定した下書きを渡す。まだ pending のまま
// 読めることがある（同一トランザクションではない）ので、二重に作らないよう
// ここで除く。
export async function confirmSiblingDrafts(
  sb: DB,
  args: {
    tripId: string;
    myMemberId: string;
    emailIds: string[];
    excludeDraftIds: string[];
    labels: SiblingConfirmLabels;
  },
): Promise<Result<SiblingConfirmResult>> {
  const { tripId, myMemberId, emailIds, excludeDraftIds, labels } = args;
  const none = { expenses: 0, events: 0, needsRateDraftId: null };
  if (emailIds.length === 0) return ok(none);

  const { data, error } = await sb
    .from("inbound_drafts")
    .select("id, email_id, kind, payload")
    .in("email_id", emailIds)
    .eq("status", "pending");
  if (error) return err(error.message);
  const rest = ((data ?? []) as PendingDraft[]).filter(
    (d) => !excludeDraftIds.includes(d.id),
  );
  if (rest.length === 0) return ok(none);

  const ctxResult = await loadSiblingConfirmContext(sb, tripId, myMemberId);
  if (!ctxResult.ok) return ctxResult;
  const ctx = { ...ctxResult.data, ...labels };

  const result: SiblingConfirmResult = {
    expenses: 0,
    events: 0,
    needsRateDraftId: null,
  };

  for (const item of deriveExpenseDraftItems(rest, ctx)) {
    const fields = expenseFieldsFromDraft(item, ctx);
    if (!fields) {
      // 為替レートが決められない外貨。1 で作ると金額が壊れるので触らず、
      // 呼び出し側がフォームに送る。
      result.needsRateDraftId ??= item.id;
      continue;
    }
    const created = await createExpense(sb, tripId, fields);
    if (!created.ok) return err(created.error);
    const resolved = await resolveInboundDraft(sb, item.id, "confirmed", {
      expenseId: created.data,
    });
    if (!resolved.ok) return resolved;
    result.expenses += 1;
  }

  for (const item of deriveEventDraftItems(rest, ctx)) {
    const created = await createEvent(
      sb,
      tripId,
      eventFieldsFromDraft(item),
      false,
    );
    if (!created.ok) return err(created.error);
    const resolved = await resolveInboundDrafts(
      sb,
      item.draftIds,
      "confirmed",
      { eventId: created.data },
    );
    if (!resolved.ok) return resolved;
    result.events += 1;
  }

  return ok(result);
}

// 破棄も確定と同じ単位（メール）で波及させる。dismiss_inbound_email が
// そのメールの未確定を全部 dismissed にする（確定済みはそのまま）。
export async function dismissSiblingDrafts(
  sb: DB,
  emailIds: string[],
): Promise<Result<void>> {
  for (const id of emailIds) {
    const r = await dismissInboundEmail(sb, id);
    if (!r.ok) return r;
  }
  return ok(undefined);
}

// メールを破棄する（残っている未確定の下書きを全部 dismissed に。確定済みはそのまま）。
export async function dismissInboundEmail(
  sb: DB,
  id: string,
): Promise<Result<void>> {
  const { error } = await sb.rpc("dismiss_inbound_email", { p_id: id });
  if (error) return err(error.message);
  return ok(undefined);
}

// 誤マージを取り消す（合体された子を独立下書きに戻す）。
export async function unmergeInboundEmail(
  sb: DB,
  id: string,
): Promise<Result<void>> {
  const { error } = await sb.rpc("unmerge_inbound_email", { p_id: id });
  if (error) return err(error.message);
  return ok(undefined);
}

// 旅行の候補（仮旅行）を本物の旅行にする。旅行を作り、その候補を構成する
// メールを全部そこへ割り当てる。以降は普通の旅行なので、下書きの確定は
// 旅行画面の通常フローに乗る（ここでは費用・予定は作らない）。
export async function assignInboundEmailsToTrip(
  sb: DB,
  emailIds: string[],
  tripId: string,
): Promise<Result<void>> {
  for (const id of emailIds) {
    const r = await assignInboundEmailTrip(sb, id, tripId);
    if (!r.ok) return r;
  }
  return ok(undefined);
}

// 下書きを旅行に割り当てる（費用化＝確定は旅行画面で行う）。tripId 未選択は null。
export async function assignInboundEmailTrip(
  sb: DB,
  id: string,
  tripId: string | null,
): Promise<Result<void>> {
  const { error } = await sb.rpc("assign_inbound_email_trip", {
    p_id: id,
    // gen-types は nullable 引数を string にする癖。未選択は null で渡す。
    p_trip_id: tripId as unknown as string,
  });
  if (error) return err(error.message);
  return ok(undefined);
}
