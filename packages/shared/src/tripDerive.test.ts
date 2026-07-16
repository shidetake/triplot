import { describe, expect, it } from "vitest";

import { buildTripTzTimeline } from "./schedule";
import {
  deriveAverageRates,
  deriveExpenseFormDefaults,
  deriveOrderedExpenses,
  deriveScheduleEvents,
  deriveTodos,
  toSettlementExpenses,
  type ExpenseRow,
  type RawEvent,
  type RawExpense,
  type RawTodo,
} from "./tripDerive";

function rawExpense(over: Partial<RawExpense>): RawExpense {
  return {
    id: "e1",
    local_price: 100,
    local_currency: "JPY",
    rate_to_default: 1,
    category_id: "c1",
    visibility: "shared",
    splittable: true,
    note: null,
    paid_at: "2026-05-01T10:00",
    tz_disambig_transit_id: null,
    tz_disambig_side: null,
    created_at: "2026-01-01T00:00:00Z",
    payer_member_id: "m1",
    created_by_member_id: "m1",
    place_id: null,
    expense_splits: [{ member_id: "m1" }],
    ...over,
  };
}

describe("deriveScheduleEvents", () => {
  it("予約TODO（event_id 付き）から needsReservation/reservationDone を導出する", () => {
    const events: RawEvent[] = [
      {
        id: "ev1",
        title: "ハイキング",
        kind: "normal",
        all_day: false,
        start_at: "2026-05-01T09:00",
        end_at: "2026-05-01T10:00",
        start_tz: null,
        end_tz: null,
        tz_disambig_transit_id: null,
        tz_disambig_side: null,
        place_id: null,
        visibility: "shared",
        note: null,
        created_by_member_id: "m1",
        event_participants: [{ member_id: "m2" }],
      },
    ];
    const todos: Pick<RawTodo, "event_id" | "done">[] = [
      { event_id: "ev1", done: true },
      { event_id: null, done: false },
    ];
    const [row] = deriveScheduleEvents(events, todos);
    expect(row.needsReservation).toBe(true);
    expect(row.reservationDone).toBe(true);
    expect(row.participantMemberIds).toEqual(["m2"]);
    expect(row.createdByMemberId).toBe("m1");
  });
});

describe("deriveOrderedExpenses", () => {
  it("壁時計＋解決TZの絶対時刻で発生順に並べる（TZ跨ぎ）", () => {
    // transit: 東京 5/1 11:00 発 → ホノルル 5/1 00:00 着（旅程で 5/1 以降は HNL）
    const tl = buildTripTzTimeline(
      [
        {
          id: "t1",
          title: "NRT-HNL",
          kind: "transit" as const,
          allDay: false,
          startAt: "2026-05-01T11:00",
          endAt: "2026-05-01T00:00",
          startTz: "Asia/Tokyo",
          endTz: "Pacific/Honolulu",
          tzDisambigTransitId: null,
          tzDisambigSide: null,
          placeId: null,
          visibility: "shared" as const,
          note: null,
          needsReservation: false,
          reservationDone: false,
          participantMemberIds: [],
        },
      ],
      null,
    );
    // 同じ壁時計 5/2 09:00 でも、HNL の方が東京より 19 時間遅く発生する。
    // 5/2 は到着後なので両方 HNL 扱いになるが、乗継当日の 5/1 で比較する:
    // 5/1 の出発側（東京）09:00 と、5/1 の到着側（HNL）09:00。
    const rows = deriveOrderedExpenses(
      [
        rawExpense({
          id: "hnl",
          paid_at: "2026-05-01T09:00",
          tz_disambig_transit_id: "t1",
          tz_disambig_side: "arrive",
          created_at: "2026-01-01T00:00:00Z",
        }),
        rawExpense({
          id: "tokyo",
          paid_at: "2026-05-01T09:00",
          tz_disambig_transit_id: "t1",
          tz_disambig_side: "depart",
          created_at: "2026-01-02T00:00:00Z",
        }),
      ],
      tl,
    );
    // 東京 09:00 (UTC 00:00) が HNL 09:00 (UTC 19:00) より先。
    expect(rows.map((r) => r.id)).toEqual(["tokyo", "hnl"]);
    expect(rows[0].tz).toBe("Asia/Tokyo");
    expect(rows[1].tz).toBe("Pacific/Honolulu");
  });

  it("同時刻は作成順で安定させる", () => {
    const tl = buildTripTzTimeline([], "Asia/Tokyo");
    const rows = deriveOrderedExpenses(
      [
        rawExpense({ id: "b", created_at: "2026-01-02T00:00:00Z" }),
        rawExpense({ id: "a", created_at: "2026-01-01T00:00:00Z" }),
      ],
      tl,
    );
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("numeric 文字列の金額/レートを number にする", () => {
    const tl = buildTripTzTimeline([], "Asia/Tokyo");
    const [row] = deriveOrderedExpenses(
      [rawExpense({ local_price: "12.5", rate_to_default: "150" })],
      tl,
    );
    expect(row.local_price).toBe(12.5);
    expect(row.rate_to_default).toBe(150);
  });
});

describe("deriveTodos", () => {
  it("いいね数と自分のいいねを導出する", () => {
    const todos: RawTodo[] = [
      {
        id: "td1",
        title: "航空券の予約",
        priority: "high",
        done: false,
        created_at: "2026-01-01T00:00:00Z",
        created_by_member_id: "m1",
        kind: "prep",
        event_id: null,
        visibility: "shared",
        todo_likes: [{ member_id: "m1" }, { member_id: "m2" }],
      },
    ];
    const [row] = deriveTodos(todos, "m2");
    expect(row.likeCount).toBe(2);
    expect(row.iLiked).toBe(true);
    expect(deriveTodos(todos, "m3")[0].iLiked).toBe(false);
  });
});

describe("deriveAverageRates / toSettlementExpenses", () => {
  const tl = buildTripTzTimeline([], "Asia/Tokyo");
  const expenses: ExpenseRow[] = deriveOrderedExpenses(
    [
      rawExpense({ id: "u1", local_currency: "USD", rate_to_default: 150 }),
      rawExpense({
        id: "u2",
        local_currency: "USD",
        rate_to_default: 160,
        created_at: "2026-01-02T00:00:00Z",
      }),
      rawExpense({
        id: "p1",
        visibility: "private",
        splittable: false,
        created_at: "2026-01-03T00:00:00Z",
      }),
    ],
    tl,
  );

  it("通貨ごとの平均レート＋default通貨=1", () => {
    const rates = deriveAverageRates(expenses, "JPY");
    expect(rates.USD).toBe(155);
    expect(rates.JPY).toBe(1);
  });

  it("settlement には shared かつ splittable のみ渡す", () => {
    const s = toSettlementExpenses(expenses);
    expect(s.map((x) => x.id).sort()).toEqual(["u1", "u2"]);
    expect(s[0].amount).toBe(100 * 150);
  });
});

describe("deriveExpenseFormDefaults", () => {
  const tl = buildTripTzTimeline([], "Asia/Tokyo");
  const categories = [
    { id: "c-first", name: "渡航", icon: "flight", color: "#000", sort_order: 0, key: null },
    { id: "c-second", name: "飲食", icon: "food", color: "#000", sort_order: 1, key: null },
    { id: "c-unc", name: "未分類", icon: "label_off", color: "#a1a1aa", sort_order: 12, key: "uncategorized" },
  ];

  it("通貨・日付は最後に入力した費用に揃え、カテゴリは常に未分類", () => {
    const expenses = deriveOrderedExpenses(
      [
        rawExpense({
          id: "old",
          local_currency: "JPY",
          category_id: "c-first",
          paid_at: "2026-05-01T10:00",
          created_at: "2026-01-01T00:00:00Z",
        }),
        rawExpense({
          id: "new",
          local_currency: "USD",
          category_id: "c-second",
          paid_at: "2026-05-02T10:00",
          created_at: "2026-01-02T00:00:00Z",
        }),
      ],
      tl,
    );
    const d = deriveExpenseFormDefaults(
      expenses,
      categories,
      "JPY",
      "2026-04-28",
      "2026-07-07",
    );
    expect(d.initialCurrency).toBe("USD");
    expect(d.initialCategoryId).toBe("c-unc");
    expect(d.initialPaidAt).toBe("2026-05-02");
  });

  it("履歴が無ければ trip のデフォルト（未分類カテゴリ・開始日）", () => {
    const d = deriveExpenseFormDefaults(
      [],
      categories,
      "JPY",
      "2026-04-28",
      "2026-07-07",
    );
    expect(d.initialCurrency).toBe("JPY");
    expect(d.initialCategoryId).toBe("c-unc");
    expect(d.initialPaidAt).toBe("2026-04-28");
  });

  it("未分類カテゴリが無い旅行（想定外データ）は先頭カテゴリにフォールバック", () => {
    const d = deriveExpenseFormDefaults(
      [],
      categories.filter((c) => c.key !== "uncategorized"),
      "JPY",
      "2026-04-28",
      "2026-07-07",
    );
    expect(d.initialCategoryId).toBe("c-first");
  });

  it("開始日未設定なら今日にフォールバック", () => {
    const d = deriveExpenseFormDefaults([], categories, "JPY", null, "2026-07-07");
    expect(d.initialPaidAt).toBe("2026-07-07");
  });
});
