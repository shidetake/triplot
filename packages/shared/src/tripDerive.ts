import type { SummaryExpense } from "./expenseSummary";
import {
  resolveEventTz,
  wallClockToUtcMs,
  type ScheduleEvent,
  type TripTzTimeline,
} from "./schedule";
import type { SettlementExpense } from "./settlement";
import type {
  Currency,
  TodoKind,
  TodoPriority,
  Visibility,
} from "./types/database";

// 旅行詳細の「生 row → 表示用 row」の純粋な派生計算。web の
// apps/web/app/trips/[tripId]/page.tsx から移設したもので、ロジックは挙動不変。
// web / RN の両方がこのモジュールを使う（I/O は data/reads/tripDetail.ts）。
//
// 各 Raw* 型は data/reads/tripDetail.ts の select 列に合わせた構造的型
// （supabase の推論行がそのまま代入できる）。gen-types は CHECK 制約を読めず
// union が string になるため、DB 境界であるこの層でドメイン型に絞る。

// ── 表示用 row 型（単一の真実。web のコンポーネントは re-export で参照） ──

export type Category = {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  key: string | null;
};

export type PlaceRow = {
  id: string;
  name: string;
  // 未マップ（自由入力）の場所は座標・住所・gpid を持たない。
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  formatted_address: string | null;
  region: string | null;
  locality: string | null;
  tentative: boolean;
  visibility: Visibility;
  note: string | null;
  icon: string;
  created_by_member_id: string;
  created_at: string;
};

// 週カレンダー・予定フォームが使う行 = 共有の ScheduleEvent + 作成者。
export type EventRow = ScheduleEvent & { createdByMemberId: string };

export type ExpenseRow = {
  id: string;
  local_price: number;
  local_currency: Currency;
  rate_to_default: number;
  category_id: string;
  visibility: Visibility;
  splittable: boolean;
  note: string | null;
  paid_at: string;
  created_at: string;
  payer_member_id: string;
  created_by_member_id: string;
  split_member_ids: string[];
  place_id: string | null;
  // 実効TZ（旅程から解決済み。表示・編集フォームの初期値に使う）。
  tz: string;
  // 乗継当日の選択（保存値そのまま）。編集フォームのラジオ初期選択に使う。
  tzDisambigTransitId: string | null;
  tzDisambigSide: "depart" | "arrive" | null;
};

export type TodoRow = {
  id: string;
  title: string;
  priority: TodoPriority;
  done: boolean;
  created_at: string;
  created_by_member_id: string;
  kind: TodoKind;
  // 予定に紐づく予約TODOなら event_id が入る（null=通常TODO）。
  event_id: string | null;
  // private 予約TODO（private 予定由来）は作成者だけに見える。手動TODOは常に shared。
  visibility: Visibility;
  // 現地TODO のいいね（prep は常に 0/false）。
  likeCount: number;
  iLiked: boolean;
};

// ── 生 row の構造的型（reads/tripDetail.ts の select 列と1対1） ──

export type RawCategory = {
  id: string;
  name: string;
  color: string;
  icon: string;
  sort_order: number;
  key?: string | null;
};

export type RawPlace = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  formatted_address: string | null;
  region: string | null;
  locality: string | null;
  tentative: boolean;
  visibility: string;
  note: string | null;
  icon: string;
  created_by_member_id: string;
  created_at: string;
};

export type RawEvent = {
  id: string;
  title: string;
  kind: string;
  all_day: boolean;
  start_at: string;
  end_at: string | null;
  start_tz: string | null;
  end_tz: string | null;
  tz_disambig_transit_id: string | null;
  tz_disambig_side: string | null;
  place_id: string | null;
  visibility: string;
  note: string | null;
  created_by_member_id: string;
  event_participants: { member_id: string }[] | null;
};

export type RawExpense = {
  id: string;
  local_price: number | string;
  local_currency: string;
  rate_to_default: number | string;
  category_id: string;
  visibility: string;
  splittable: boolean;
  note: string | null;
  paid_at: string;
  tz_disambig_transit_id: string | null;
  tz_disambig_side: string | null;
  created_at: string;
  payer_member_id: string;
  created_by_member_id: string;
  place_id: string | null;
  expense_splits: { member_id: string }[] | null;
};

export type RawTodo = {
  id: string;
  title: string;
  priority: string;
  done: boolean;
  created_at: string;
  created_by_member_id: string;
  kind: string;
  event_id: string | null;
  visibility: string;
  todo_likes: { member_id: string }[] | null;
};

// ── 派生計算 ──

export function deriveCategories(
  categoriesRaw: RawCategory[] | null,
): Category[] {
  return (categoriesRaw ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    color: c.color,
    sort_order: c.sort_order,
    // key は migration 20260625000002 で追加。生成型更新後は cast 不要になる。
    key: c.key ?? null,
  }));
}

export function derivePlaces(placesRaw: RawPlace[] | null): PlaceRow[] {
  return (placesRaw ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    google_place_id: p.google_place_id,
    formatted_address: p.formatted_address,
    region: p.region,
    locality: p.locality,
    tentative: p.tentative,
    visibility: p.visibility as Visibility,
    note: p.note,
    icon: p.icon,
    created_by_member_id: p.created_by_member_id,
    created_at: p.created_at,
  }));
}

// events は壁時計（timestamp without tz）。文字列のまま素通しする
// （new Date でローカルTZ解釈させない）。予約状態は予約TODO（event_id 付き）
// から引く: has = 要予約、値(done) = 予約済か。
export function deriveScheduleEvents(
  eventsRaw: RawEvent[] | null,
  todosRaw: Pick<RawTodo, "event_id" | "done">[] | null,
): EventRow[] {
  const reservationByEvent = new Map<string, boolean>();
  for (const t of todosRaw ?? []) {
    if (t.event_id) reservationByEvent.set(t.event_id, t.done);
  }
  return (eventsRaw ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    kind: e.kind as "normal" | "transit",
    allDay: e.all_day,
    startAt: e.start_at,
    endAt: e.end_at,
    startTz: e.start_tz,
    endTz: e.end_tz,
    tzDisambigTransitId: e.tz_disambig_transit_id,
    tzDisambigSide: e.tz_disambig_side as "depart" | "arrive" | null,
    placeId: e.place_id,
    visibility: e.visibility as Visibility,
    note: e.note,
    createdByMemberId: e.created_by_member_id,
    needsReservation: reservationByEvent.has(e.id),
    reservationDone: reservationByEvent.get(e.id) ?? false,
    participantMemberIds: (e.event_participants ?? []).map((p) => p.member_id),
  }));
}

// 発生順（古い→新しい、新しいものが下）は保存済みキャッシュを持たず、都度
// resolveEventTz で解決したTZ + paid_at（壁時計）から絶対時刻を算出して
// 決める（乗継の追加・編集に自動追従する）。同時刻は作成順で安定させる。
export function deriveOrderedExpenses(
  expensesRaw: RawExpense[] | null,
  tzTimeline: TripTzTimeline,
): ExpenseRow[] {
  return (expensesRaw ?? [])
    .map((e) => {
      const tz = resolveEventTz(
        e.paid_at.slice(0, 10),
        e.tz_disambig_transit_id,
        e.tz_disambig_side as "depart" | "arrive" | null,
        tzTimeline,
      );
      const row: ExpenseRow = {
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
        tz,
        tzDisambigTransitId: e.tz_disambig_transit_id,
        tzDisambigSide: e.tz_disambig_side as "depart" | "arrive" | null,
      };
      return { row, occurredAtMs: wallClockToUtcMs(e.paid_at, tz) };
    })
    .sort(
      (a, b) =>
        a.occurredAtMs - b.occurredAtMs ||
        (a.row.created_at < b.row.created_at ? -1 : 1),
    )
    .map((x) => x.row);
}

export function deriveTodos(
  todosRaw: RawTodo[] | null,
  myMemberId: string,
): TodoRow[] {
  return (todosRaw ?? []).map((t) => {
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
      visibility: t.visibility as Visibility,
      likeCount: likes.length,
      iLiked: likes.some((l) => l.member_id === myMemberId),
    };
  });
}

// 通貨ごとの平均レート（フォームのデフォルトと表示用）。default_currency は常に 1。
export function deriveAverageRates(
  expenses: ExpenseRow[],
  defaultCurrency: Currency,
): Partial<Record<Currency, number>> {
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
  averageRates[defaultCurrency] = 1;
  return averageRates;
}

// Settlement / Summary 用に default_currency に換算済みで渡す。
export function toSettlementExpenses(
  expenses: ExpenseRow[],
): SettlementExpense[] {
  return expenses
    .filter((e) => e.visibility === "shared" && e.splittable)
    .map((e) => ({
      id: e.id,
      amount: e.local_price * e.rate_to_default,
      payerMemberId: e.payer_member_id,
      splitMemberIds: e.split_member_ids,
    }));
}

export function toSummaryExpenses(expenses: ExpenseRow[]): SummaryExpense[] {
  return expenses.map((e) => ({
    visibility: e.visibility,
    amountInDefault: e.local_price * e.rate_to_default,
    payerMemberId: e.payer_member_id,
    splittable: e.splittable,
    splitMemberIds: e.split_member_ids,
    createdByMemberId: e.created_by_member_id,
  }));
}

// 費用フォームの初期値は「最後に入力した費用」に揃える（通貨・カテゴリ・日付）。
// 履歴が無いときだけ trip のデフォルトにフォールバック。
export function deriveExpenseFormDefaults(
  expenses: ExpenseRow[],
  categories: Category[],
  defaultCurrency: Currency,
  tripStartDate: string | null,
  today: string,
): {
  initialCurrency: Currency;
  initialCategoryId: string;
  initialPaidAt: string;
} {
  const lastEntered = expenses.reduce<ExpenseRow | null>(
    (acc, e) => (acc && acc.created_at >= e.created_at ? acc : e),
    null,
  );
  return {
    initialCurrency: lastEntered?.local_currency ?? defaultCurrency,
    // 初回（費用ゼロ）は一番上のカテゴリ（= 渡航。sort_order 昇順の先頭）。
    // 2件目以降は最後に使ったカテゴリを既定に。
    initialCategoryId: lastEntered?.category_id ?? categories[0]?.id ?? "",
    // 初回（費用ゼロ）は旅行開始日、それ以降は最後に作った費用の日を既定に。
    // 開始日未設定の trip では今日にフォールバック。
    initialPaidAt: lastEntered
      ? lastEntered.paid_at.slice(0, 10)
      : (tripStartDate ?? today),
  };
}
