import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AddExpenseButton } from "@/components/add-expense-button";
import { type Category } from "@/components/expense-form";
import { ExpenseList, type ExpenseRow } from "@/components/expense-list";
import { ExpenseSummaryView } from "@/components/expense-summary";
import { MembersSection } from "@/components/members-section";
import type { PlaceRow, PlaceStatus } from "@/components/place-list";
import { PlacesSection } from "@/components/places-section";
import { type EventRow, ScheduleSection } from "@/components/schedule-section";
import { type TodoRow, TodoSection } from "@/components/todo-section";
import { TripActions } from "@/components/trip-actions";
import {
  calculateExpenseSummary,
  type SummaryExpense,
} from "@/lib/expenseSummary";
import { buildTripTzTimeline } from "@/lib/schedule";
import {
  calculateSettlements,
  type SettlementExpense,
} from "@/lib/settlement";
import { type KmlPlacemark } from "@/lib/placeKml";
import { centroid, TOKYO } from "@/lib/placeMap";
import { createClient } from "@/lib/supabase/server";
import type {
  Currency,
  TodoKind,
  TodoPriority,
  Visibility,
} from "@/lib/types/database";

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

  // 4 本とも tripId キーで互いに独立。RLS で保護されているので並列で叩く
  // （直列だと Vercel→Supabase の RTT が 4 回積み上がる）。
  const [
    { data: trip, error: tripError },
    { data: members },
    { data: categoriesRaw },
    { data: expensesRaw },
    { data: placeStatusesRaw },
    { data: placesRaw },
    { data: eventsRaw },
    { data: todosRaw },
    { data: pinOptionsRaw },
  ] = await Promise.all([
    supabase
      .from("trips")
      .select(
        "id, title, start_date, end_date, default_currency",
      )
      .eq("id", tripId)
      .single(),
    supabase
      .from("trip_members")
      .select("id, user_id, display_name, kind, color, is_admin")
      .eq("trip_id", tripId)
      .is("left_at", null)
      .order("joined_at", { ascending: true }),
    supabase
      .from("expense_categories")
      .select("id, name, color, icon, sort_order")
      .eq("trip_id", tripId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("expenses")
      .select(
        "id, local_price, local_currency, rate_to_default, category_id, visibility, splittable, note, paid_at, occurred_at, tz, created_at, payer_member_id, created_by_member_id, place_id, expense_splits(member_id)",
      )
      .eq("trip_id", tripId)
      // 発生順（古い→新しい、新しいものが下）。occurred_at は壁時計をその
      // 費用の TZ で解釈した絶対時刻なので、跨TZでも正しく時系列に並ぶ。
      // 同 occurred_at は作成順で安定させる。
      .order("occurred_at", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("place_statuses")
      .select("id, name, color, sort_order, tentative")
      .eq("trip_id", tripId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("places")
      .select(
        "id, name, lat, lng, google_place_id, formatted_address, region, locality, status_id, visibility, note, icon, created_by_member_id, created_at",
      )
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false }),
    supabase
      .from("events")
      .select(
        "id, title, kind, all_day, start_at, end_at, start_tz, end_tz, place_id, visibility, note, created_by_member_id, created_at, event_participants(member_id)",
      )
      .eq("trip_id", tripId)
      .order("start_at", { ascending: true }),
    supabase
      .from("todos")
      .select(
        "id, title, priority, done, created_at, created_by_member_id, kind, event_id, todo_likes(member_id)",
      )
      .eq("trip_id", tripId)
      // 表示順は lib/todoSort（優先度→作成順）でアプリ側に統一。
      .order("created_at", { ascending: true }),
    supabase
      .from("trip_pin_options")
      .select("id, icon, label, sort_order")
      .eq("trip_id", tripId)
      .order("sort_order", { ascending: true }),
  ]);

  if (tripError || !trip) notFound();

  const activeMembers = members ?? [];
  const me = activeMembers.find((m) => m.user_id === user.id);
  if (!me) notFound();

  const categories: Category[] = categoriesRaw ?? [];

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
    created_at: e.created_at,
    payer_member_id: e.payer_member_id,
    created_by_member_id: e.created_by_member_id,
    split_member_ids: (e.expense_splits ?? []).map((s) => s.member_id),
    place_id: e.place_id,
    tz: e.tz,
  }));

  const pinOptions = (pinOptionsRaw ?? []).map((p) => ({
    id: p.id,
    icon: p.icon,
    label: p.label,
    sort_order: p.sort_order,
  }));

  const placeStatuses: PlaceStatus[] = (placeStatusesRaw ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    sort_order: s.sort_order,
    tentative: s.tentative,
  }));

  const places: PlaceRow[] = (placesRaw ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    google_place_id: p.google_place_id,
    formatted_address: p.formatted_address,
    region: p.region,
    locality: p.locality,
    status_id: p.status_id,
    visibility: p.visibility as Visibility,
    note: p.note,
    icon: p.icon,
    created_by_member_id: p.created_by_member_id,
    created_at: p.created_at,
  }));

  // 予約TODO（event_id 付き）から予定ごとの予約状態を引く。
  // has = 要予約、値(done) = 予約済か。
  const reservationByEvent = new Map<string, boolean>();
  for (const t of todosRaw ?? []) {
    if (t.event_id) reservationByEvent.set(t.event_id, t.done);
  }

  // events は壁時計（timestamp without tz）。文字列のまま素通しする
  // （new Date でローカルTZ解釈させない）。
  const scheduleEvents: EventRow[] = (eventsRaw ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    kind: e.kind as "normal" | "transit",
    allDay: e.all_day,
    startAt: e.start_at,
    endAt: e.end_at,
    startTz: e.start_tz,
    endTz: e.end_tz,
    placeId: e.place_id,
    visibility: e.visibility as Visibility,
    note: e.note,
    createdByMemberId: e.created_by_member_id,
    needsReservation: reservationByEvent.has(e.id),
    reservationDone: reservationByEvent.get(e.id) ?? false,
    participantMemberIds: (e.event_participants ?? []).map((p) => p.member_id),
  }));

  // 個別TZの初期値 = 最後に入力した（created_at 最大の）非終日イベントのTZ。
  // 費用フォームの「最後に入力した値を初期値に」と同方針。無ければ null。
  const lastEnteredEvent = (eventsRaw ?? [])
    .filter((e) => !e.all_day)
    .reduce<{ created_at: string; start_tz: string } | null>(
      (acc, e) =>
        acc && acc.created_at >= e.created_at
          ? acc
          : { created_at: e.created_at, start_tz: e.start_tz },
      null,
    );
  const initialEventTz = lastEnteredEvent?.start_tz ?? null;

  const todos: TodoRow[] = (todosRaw ?? []).map((t) => {
    const likes = t.todo_likes ?? [];
    return {
      id: t.id,
      title: t.title,
      priority: t.priority as TodoPriority,
      done: t.done,
      created_at: t.created_at,
      created_by_member_id: t.created_by_member_id,
      kind: t.kind as TodoKind,
      event_id: t.event_id,
      likeCount: likes.length,
      iLiked: likes.some((l) => l.member_id === me.id),
    };
  });
  const prepTodos = todos.filter((t) => t.kind === "prep");
  const onsiteTodos = todos.filter((t) => t.kind === "onsite");
  const todoMembers = activeMembers.map((m) => ({
    id: m.id,
    display_name: m.display_name,
    color: m.color,
  }));

  const placesForPicker = places.map((p) => ({ id: p.id, name: p.name }));
  // KML エクスポート用: 座標を持つ place のみ。説明は住所＋メモを改行で連結。
  const kmlPlacemarks: KmlPlacemark[] = places
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => ({
      name: p.name,
      lat: p.lat as number,
      lng: p.lng as number,
      description:
        [p.formatted_address, p.note].filter(Boolean).join("\n") || null,
    }));
  // 費用の TZ 推定に使う旅程タイムライン（transit から日付→TZ を引く）。
  const tzTimeline = buildTripTzTimeline(scheduleEvents);
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

  // フォームの初期値は「最後に入力した費用」に揃える（通貨・カテゴリ・日付）。
  // 履歴が無いときだけ trip のデフォルトにフォールバック。
  const lastEntered = expenses.reduce<ExpenseRow | null>(
    (acc, e) => (acc && acc.created_at >= e.created_at ? acc : e),
    null,
  );

  const today = new Date().toISOString().slice(0, 10);
  // 旅行開始日以降か（準備TODOの既定折りたたみ判定に使う）。開始日未設定は未開始扱い。
  const tripStarted = trip.start_date != null && today >= trip.start_date;
  const initialCurrency: Currency =
    lastEntered?.local_currency ?? defaultCurrency;
  // 初回（費用ゼロ）は一番上のカテゴリ（= 渡航。sort_order 昇順の先頭）。
  // 2件目以降は最後に使ったカテゴリを既定に。
  const initialCategoryId =
    lastEntered?.category_id ?? categories[0]?.id ?? "";
  // 初回（費用ゼロ）は旅行開始日、それ以降は最後に作った費用の日を既定に。
  // 開始日未設定の trip では今日にフォールバック。
  const initialPaidAt = lastEntered
    ? lastEntered.paid_at.slice(0, 10)
    : (trip.start_date ?? today);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="flex items-start justify-between gap-3">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← 旅行一覧に戻る
        </Link>
        <TripActions
          tripId={tripId}
          baseUrl={inviteBaseUrl}
          iAmAdmin={me.is_admin}
          tripTitle={trip.title}
          kmlPlacemarks={kmlPlacemarks}
        />
      </div>

      <header className="mt-4">
        <h1 className="text-2xl font-semibold">{trip.title}</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {trip.start_date ?? "?"} 〜 {trip.end_date ?? "?"}・精算通貨:{" "}
          {trip.default_currency}
        </p>
      </header>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-zinc-700">メンバー</h2>
        <MembersSection
          members={activeMembers.map((m) => ({
            id: m.id,
            display_name: m.display_name,
            color: m.color,
          }))}
        />
      </section>

      <section className="mt-10 space-y-6">
        <ScheduleSection
          tripId={tripId}
          initialTz={initialEventTz}
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
        />
      </section>

      <section className="mt-10 space-y-6">
        <h2 className="text-lg font-medium">場所</h2>

        <PlacesSection
          tripId={tripId}
          places={places}
          statuses={placeStatuses}
          pinOptions={pinOptions}
          members={activeMembers.map((m) => ({
            id: m.id,
            color: m.color,
          }))}
          myMemberId={me.id}
        />
      </section>

      <section className="mt-10 space-y-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-medium">費用</h2>
          <AddExpenseButton
            tripId={tripId}
            members={activeMembers.map((m) => ({
              id: m.id,
              display_name: m.display_name,
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
          members={activeMembers}
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

      <section className="mt-10 space-y-6">
        <h2 className="text-lg font-medium">TODOリスト</h2>

        <TodoSection
          tripId={tripId}
          kind="prep"
          title="準備"
          defaultCollapsed={tripStarted}
          todos={prepTodos}
          members={todoMembers}
          myMemberId={me.id}
        />

        <TodoSection
          tripId={tripId}
          kind="onsite"
          title="現地"
          defaultCollapsed={false}
          todos={onsiteTodos}
          members={todoMembers}
          myMemberId={me.id}
        />
      </section>
    </main>
  );
}
