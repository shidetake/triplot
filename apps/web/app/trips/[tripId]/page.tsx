import { getLocale, getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AddExpenseButton } from "@/components/add-expense-button";
import { ChevronIcon } from "@/components/icons";
import { HelpTip } from "@/components/help-tip";
import { DraftConfirmButton } from "@/components/draft-confirm-button";
import { EventDraftConfirmButton } from "@/components/event-draft-confirm-button";
import { type CalendarExportEvent } from "@/components/calendar-export-dialog";
import { type Category } from "@/components/expense-form";
import { ExpenseList, type ExpenseRow } from "@/components/expense-list";
import { ExpenseSummaryView } from "@/components/expense-summary";
import { InlineDivider } from "@/components/inline-divider";
import { MembersSection } from "@/components/members-section";
import type { PlaceRow } from "@/components/place-list";
import { PlacesSection } from "@/components/places-section";
import { type EventRow, ScheduleSection } from "@/components/schedule-section";
import { type TodoRow, TodoSection } from "@/components/todo-section";
import { TripActions } from "@/components/trip-actions";
import { TripDetailTabs } from "@/components/trip-detail-tabs";
import { TripHeaderCompact } from "@/components/trip-header-compact";
import { calculateExpenseSummary } from "@triplot/shared/expenseSummary";
import {
  buildTripTzTimeline,
  resolveEventTz,
} from "@triplot/shared/schedule";
import { calculateSettlements } from "@triplot/shared/settlement";
import { fetchTripDetailRows } from "@triplot/shared/data/reads/tripDetail";
import { fetchTripPendingDrafts } from "@triplot/shared/data/reads/inbox";
import {
  deriveAverageRates,
  deriveCategories,
  deriveExpenseFormDefaults,
  deriveOrderedExpenses,
  derivePlaces,
  deriveScheduleEvents,
  deriveTodos,
  toSettlementExpenses,
  toSummaryExpenses,
} from "@triplot/shared/tripDerive";
import { type ExpenseCsvRow } from "@/lib/expenseCsv";
import { type KmlPlacemark } from "@/lib/placeKml";
import { centroid, TOKYO } from "@triplot/shared/placeMap";
import { formatTripDateRange } from "@triplot/shared/ymd";
import { monthDayLabel } from "@triplot/shared/import/draftLabel";
import {
  deriveEventDraftItems,
  deriveExpenseDraftItems,
} from "@triplot/shared/import/drafts";
import type { TripPlace } from "@triplot/shared/import/placeMatch";
import { createClient } from "@/lib/supabase/server";
import type { Currency } from "@triplot/shared/types/database";


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

  // 本文の随所（kmlPlacemarks 等）で早い段階から使うので先に解決しておく。
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  // 読み取りクエリは shared（RN と共用）。派生計算も tripDerive に集約。
  const {
    trip,
    tripError,
    members,
    categoriesRaw,
    expensesRaw,
    placesRaw,
    eventsRaw,
    todosRaw,
    pinOptionsRaw,
  } = await fetchTripDetailRows(supabase, tripId);

  if (tripError || !trip) notFound();

  const activeMembers = members ?? [];
  const me = activeMembers.find((m) => m.user_id === user.id);
  if (!me) notFound();

  const categories: Category[] = deriveCategories(categoriesRaw);

  // gen-types は CHECK 制約を読めず string を返すので、DB 境界でドメイン型に絞る
  const defaultCurrency = trip.default_currency as Currency;

  const pinOptions = (pinOptionsRaw ?? []).map((p) => ({
    id: p.id,
    icon: p.icon,
    label: p.label,
    sort_order: p.sort_order,
  }));

  const places: PlaceRow[] = derivePlaces(placesRaw);

  const scheduleEvents: EventRow[] = deriveScheduleEvents(eventsRaw, todosRaw);

  // 費用/予定の TZ 推定に使う旅程タイムライン（transit から日付→TZ を引く。
  // transit が無い旅行の唯一の拠り所は trips.default_timezone）。
  const tzTimeline = buildTripTzTimeline(scheduleEvents, trip.default_timezone);

  const expenses: ExpenseRow[] = deriveOrderedExpenses(expensesRaw, tzTimeline);

  const todos: TodoRow[] = deriveTodos(todosRaw, me.id);
  const prepTodos = todos.filter((t) => t.kind === "prep");
  const onsiteTodos = todos.filter((t) => t.kind === "onsite");
  const todoMembers = activeMembers.map((m) => ({
    id: m.id,
    display_name: m.display_name,
    color: m.color,
    avatarUrl: m.users?.avatar_url ?? null,
  }));

  const placesForPicker = places.map((p) => ({ id: p.id, name: p.name }));
  // KML/KMZ エクスポート用: 座標を持つ place のみ。説明は住所＋メモを改行で連結。
  const kmlPlacemarks: KmlPlacemark[] = places
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => ({
      name: p.name,
      lat: p.lat as number,
      lng: p.lng as number,
      description:
        [p.formatted_address, p.note].filter(Boolean).join("\n") || null,
      colorHex: p.tentative ? "#f59e0b" : "#10b981",
      category: p.tentative ? t("place.statusCandidate") : t("place.statusConfirmed"),
      iconKey: p.icon,
    }));
  // スケジュールの Google 検索の地理バイアス（マップ済みピンの重心 or 東京）
  const placesBiasCenter =
    centroid(
      places
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => ({ lat: p.lat as number, lng: p.lng as number })),
    ) ?? TOKYO;

  // 招待リンクの絶対URLはサーバ側でヘッダから組む（client で window を
  // 触ると SSR と不一致 / effect-setState になるため）。
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const inviteBaseUrl = host ? `${proto}://${host}` : "";

  // 通貨ごとの平均レート（フォームのデフォルトと表示用）
  const averageRates = deriveAverageRates(expenses, defaultCurrency);

  // Settlement / Summary 用に default_currency に換算済みで渡す
  const settlements = calculateSettlements(
    toSettlementExpenses(expenses),
    activeMembers.map((m) => ({ id: m.id })),
  );

  const summary = calculateExpenseSummary(toSummaryExpenses(expenses), me.id);

  // CSV エクスポート用: ID を名前に解決した行。発生順（expenses は既に
  // 発生順に並んでいる）。
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  const memberNameById = new Map(
    activeMembers.map((m) => [m.id, m.display_name]),
  );
  const placeNameById = new Map(places.map((p) => [p.id, p.name]));
  // カレンダーエクスポート用: 自分に見える予定を Google カレンダー形式の入力へ。
  // 場所は名前＋住所を location に、メモを description に。normal/allday は
  // start_tz を持たないので旅程から解決した値を流用。RLS で既に
  // shared+private(自分) に絞られている。
  const placeAddressById = new Map(
    places.map((p) => [p.id, p.formatted_address]),
  );
  const calendarEvents: CalendarExportEvent[] = scheduleEvents.map((e) => {
    const placeName = e.placeId ? (placeNameById.get(e.placeId) ?? "") : "";
    const placeAddr = e.placeId
      ? (placeAddressById.get(e.placeId) ?? null)
      : null;
    const location =
      [placeName, placeAddr].filter(Boolean).join(" ") || null;
    // 参加者空配列 = 全員参加のシュガー。自分が当事者か全員予定なら mine。
    const mine =
      e.participantMemberIds.length === 0 ||
      e.participantMemberIds.includes(me.id);
    // transit は実TZを直接使う。normal/allday は startTz を持たないことが
    // あるので旅程から都度解決する（乗継編集にも自動追従する）。
    const startTz =
      e.kind === "transit"
        ? (e.startTz as string)
        : resolveEventTz(
            e.startAt.slice(0, 10),
            e.tzDisambigTransitId,
            e.tzDisambigSide,
            tzTimeline,
          );
    const endTz = e.kind === "transit" ? (e.endTz as string) : startTz;
    return {
      title: e.title,
      allDay: e.allDay,
      startAt: e.startAt,
      endAt: e.endAt,
      startTz,
      endTz,
      location,
      description: e.note,
      mine,
    };
  });
  const expenseCsvRows: ExpenseCsvRow[] = expenses.map((e) => ({
    date: e.paid_at.slice(0, 10),
    category: categoryNameById.get(e.category_id) ?? "",
    payer: memberNameById.get(e.payer_member_id) ?? "",
    localAmount: e.local_price,
    localCurrency: e.local_currency,
    // 小数誤差を避けて精算通貨の最小単位想定で 2 桁に丸め。
    defaultAmount: Math.round(e.local_price * e.rate_to_default * 100) / 100,
    defaultCurrency,
    splittable: e.splittable,
    visibility: e.visibility,
    place: e.place_id ? (placeNameById.get(e.place_id) ?? "") : "",
    note: e.note ?? "",
  }));

  const today = new Date().toISOString().slice(0, 10);
  // 旅行開始日以降か（準備TODOの既定折りたたみ判定に使う）。開始日未設定は未開始扱い。
  const tripStarted = trip.start_date != null && today >= trip.start_date;
  // フォームの初期値は「最後に入力した費用」に揃える（通貨・カテゴリ・日付）。
  // 履歴が無いときだけ trip のデフォルトにフォールバック。
  const { initialCurrency, initialCategoryId, initialPaidAt } =
    deriveExpenseFormDefaults(
      expenses,
      categories,
      defaultCurrency,
      trip.start_date,
      today,
    );

  // この旅行に割り当て済み・未確定の取り込み下書き。確定は費用/予定それぞれの
  // セクションの事前入力フォームで行う。
  const tripDrafts = await fetchTripPendingDrafts(supabase, tripId);

  const placesForMatch: TripPlace[] = places.map((p) => ({
    id: p.id,
    name: p.name,
    formattedAddress: p.formatted_address,
  }));

  // 下書き → 事前入力の組み立ては shared（RN と共用）。
  const importDrafts = deriveExpenseDraftItems(tripDrafts, {
    categories,
    defaultCurrency,
    fallbackCategoryId: initialCategoryId,
    places: placesForMatch,
    unknownMerchantLabel: t("tripDetail.unknownMerchant"),
  });

  const eventDrafts = deriveEventDraftItems(tripDrafts, {
    tzTimeline,
    places: placesForMatch,
    locale,
    untitledLabel: t("common.untitledEvent"),
    reservationRefLabel: (ref) => t("tripDetail.reservationRefNote", { ref }),
  });

  // ⋯メニュー等（TripActions）は広い画面のヘッダーと狭い画面の圧縮ヘッダーの
  // 両方に置く。同じ要素オブジェクトを2箇所で使うと React はそれぞれ独立に
  // マウントする（開くまでネットワークアクセスしないコンポーネントなので無害）。
  const tripActionsEl = (
    <TripActions
      tripId={tripId}
      baseUrl={inviteBaseUrl}
      iAmAdmin={me.is_admin}
      tripTitle={trip.title}
      tripStartDate={trip.start_date}
      tripEndDate={trip.end_date}
      tripDefaultCurrency={defaultCurrency}
      kmlPlacemarks={kmlPlacemarks}
      expenseCsvRows={expenseCsvRows}
      calendarEvents={calendarEvents}
    />
  );
  // 狭い画面の圧縮ヘッダー用（年なし M/D、両方揃っている時だけ）。
  const compactDateRange =
    trip.start_date && trip.end_date
      ? `${monthDayLabel(trip.start_date)}–${monthDayLabel(trip.end_date)}`
      : "";

  return (
    <main className="mx-auto w-full max-w-3xl md:px-6 md:py-10">
      <TripHeaderCompact
        backLabel={t("tripDetail.backToTrips")}
        tripTitle={trip.title}
        dateRangeShort={compactDateRange}
        members={activeMembers.map((m) => ({
          id: m.id,
          display_name: m.display_name,
          color: m.color,
          avatarUrl: m.users?.avatar_url ?? null,
        }))}
        actions={tripActionsEl}
      />

      <div className="hidden px-6 pt-10 md:block">
        <div className="flex items-start justify-between gap-3">
          <Link
            href="/trips"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <ChevronIcon size={16} className="rotate-180" />
            {t("tripDetail.backToTrips")}
          </Link>
          {tripActionsEl}
        </div>

        <header className="mt-4">
          <h1 className="text-2xl font-semibold">{trip.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              {formatTripDateRange(trip.start_date, trip.end_date, locale)}
            </span>
            <InlineDivider />
            <span>
              {t("tripDetail.settlementCurrency")}: {trip.default_currency}
            </span>
          </p>
        </header>

        <section className="mt-8">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("members.heading")}
          </h2>
          <MembersSection
            members={activeMembers.map((m) => ({
              id: m.id,
              display_name: m.display_name,
              color: m.color,
            }))}
          />
        </section>
      </div>

      <div className="px-6 md:px-0">
      <TripDetailTabs
        schedule={
          <section className="mt-10 space-y-6">
            <ScheduleSection
              tripId={tripId}
              initialTz={trip.default_timezone}
              tripStart={trip.start_date}
              tripEnd={trip.end_date}
              events={scheduleEvents}
              places={placesForPicker}
              members={activeMembers.map((m) => ({
                id: m.id,
                display_name: m.display_name,
                color: m.color,
              }))}
              biasCenter={placesBiasCenter}
              myMemberId={me.id}
              eventDrafts={eventDrafts}
              afterHeading={
                eventDrafts.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-400/20 dark:bg-amber-400/10">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-amber-900 dark:text-amber-300">
                      {t("tripDetail.pendingImports", { count: eventDrafts.length })}
                      <HelpTip label={t("tripDetail.importHelpLabel")} widthClass="w-52">
                        {t("tripDetail.importEventHelp")}
                      </HelpTip>
                    </div>
                    <div className="mt-3 space-y-2">
                      {eventDrafts.map((d) => (
                        <EventDraftConfirmButton
                          key={d.id}
                          draftId={d.id}
                          labelParts={d.labelParts}
                          tripId={tripId}
                          defaultTz={d.tz}
                          tripStart={trip.start_date}
                          tripEnd={trip.end_date}
                          state={{
                            mode: "create",
                            date: d.date,
                            time: d.time,
                            tz: d.tz,
                            prefill: d.prefill,
                          }}
                          places={placesForPicker}
                          members={activeMembers.map((m) => ({
                            id: m.id,
                            display_name: m.display_name,
                            color: m.color,
                          }))}
                          biasCenter={placesBiasCenter}
                          tzTimeline={tzTimeline}
                        />
                      ))}
                    </div>
                  </div>
                )
              }
            />
          </section>
        }
        places={
          // 狭い画面は PlacesSection 内部で地図/検索/一覧パネルを直接
          // position:fixed にして画面いっぱいに描く。ここは他タブと同じ通常フロー
          // （見出しは広い画面だけ）。
          <section className="mt-10 space-y-6">
            <h2 className="hidden text-lg font-semibold md:block">
              {t("tripDetail.places")}
            </h2>

            <PlacesSection
              tripId={tripId}
              places={places}
              pinOptions={pinOptions}
              members={activeMembers.map((m) => ({
                id: m.id,
                color: m.color,
              }))}
              myMemberId={me.id}
            />
          </section>
        }
        expenses={
          <section className="mt-10 space-y-6">
            {/* data-mobile-chrome-top: 費用追加のボトムシートを開いた時、この
                見出し+追加ボタンの行までは見えるようにする実測対象
                （components/use-mobile-chrome-margins.ts）。 */}
            <div
              data-mobile-chrome-top
              className="flex items-center justify-between gap-2"
            >
              <h2 className="text-lg font-semibold">{t("tripDetail.expenses")}</h2>
              <AddExpenseButton
                tripId={tripId}
                members={activeMembers.map((m) => ({
                  id: m.id,
                  display_name: m.display_name,
                  color: m.color,
                }))}
                myMemberId={me.id}
                defaultCurrency={defaultCurrency}
                initialCurrency={initialCurrency}
                categories={categories}
                initialCategoryId={initialCategoryId}
                averageRates={averageRates}
                initialPaidAt={initialPaidAt}
                places={placesForPicker}
                biasCenter={placesBiasCenter}
                tzTimeline={tzTimeline}
                tripStart={trip.start_date}
                tripEnd={trip.end_date}
              />
            </div>

            {importDrafts.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-400/20 dark:bg-amber-400/10">
                <div className="flex items-center gap-1.5 text-sm font-medium text-amber-900 dark:text-amber-300">
                  {t("tripDetail.pendingImports", { count: importDrafts.length })}
                  <HelpTip label={t("tripDetail.importHelpLabel")} widthClass="w-52">
                    {t("tripDetail.importHelp")}
                  </HelpTip>
                </div>
                <div className="mt-3 space-y-2">
                  {importDrafts.map((d) => (
                    <DraftConfirmButton
                      key={d.id}
                      draftId={d.id}
                      labelParts={d.labelParts}
                      tripId={tripId}
                      members={activeMembers.map((m) => ({
                        id: m.id,
                        display_name: m.display_name,
                        color: m.color,
                      }))}
                      myMemberId={me.id}
                      defaultCurrency={defaultCurrency}
                      initialCurrency={d.initialCurrency}
                      categories={categories}
                      initialCategoryId={d.initialCategoryId}
                      averageRates={averageRates}
                      initialPaidAt={d.initialPaidAt}
                      places={placesForPicker}
                      biasCenter={placesBiasCenter}
                      tzTimeline={tzTimeline}
                      tripStart={trip.start_date}
                      tripEnd={trip.end_date}
                      initialPrice={d.initialPrice}
                      initialPlace={d.initialPlace}
                      autoResolvePlace={d.autoResolvePlace}
                      initialTime={d.initialTime}
                    />
                  ))}
                </div>
              </div>
            )}

            <ExpenseSummaryView
              summary={summary}
              settlements={settlements}
              members={activeMembers}
              defaultCurrency={defaultCurrency}
              averageRates={averageRates}
            />

            <ExpenseList
              tripId={tripId}
              expenses={expenses}
              members={activeMembers.map((m) => ({
                id: m.id,
                display_name: m.display_name,
                color: m.color,
                avatarUrl: m.users?.avatar_url ?? null,
              }))}
              categories={categories}
              places={placesForPicker}
              defaultCurrency={defaultCurrency}
              initialCurrency={initialCurrency}
              initialCategoryId={initialCategoryId}
              averageRates={averageRates}
              initialPaidAt={initialPaidAt}
              biasCenter={placesBiasCenter}
              tzTimeline={tzTimeline}
              tripStart={trip.start_date}
              tripEnd={trip.end_date}
              myMemberId={me.id}
            />
          </section>
        }
        todos={
          <section className="mt-10 space-y-6">
            <div className="flex items-center gap-1.5">
              <h2 className="text-lg font-semibold">{t("tripDetail.todoList")}</h2>
              <HelpTip label={t("tripDetail.privateTodoHelpLabel")} widthClass="w-60">
                {t("tripDetail.privateTodoHelp")}
              </HelpTip>
            </div>

            <TodoSection
              tripId={tripId}
              kind="prep"
              title={t("tripDetail.todoPrep")}
              defaultCollapsed={tripStarted}
              todos={prepTodos}
              members={todoMembers}
              myMemberId={me.id}
            />

            <TodoSection
              tripId={tripId}
              kind="onsite"
              title={t("tripDetail.todoOnsite")}
              defaultCollapsed={false}
              todos={onsiteTodos}
              members={todoMembers}
              myMemberId={me.id}
            />
          </section>
        }
      />
      </div>
    </main>
  );
}
