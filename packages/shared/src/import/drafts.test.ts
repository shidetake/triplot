import { describe, expect, it } from "vitest";

import { buildTripTzTimeline } from "../schedule";

import {
  deriveEventDraftItems,
  deriveExpenseDraftItems,
  draftEventId,
  draftIdFromEventId,
  draftToScheduleEvent,
  type EventDraftItem,
} from "./drafts";
import type { EventDraft, Receipt } from "./schema";

const places = [
  {
    id: "kai",
    name: "Kai Coffee",
    formattedAddress: "2490 Kalakaua Ave, Honolulu, HI",
  },
];

function receipt(p: Partial<Receipt>): Receipt {
  return {
    merchant: "Kai Coffee",
    total: 12.5,
    currency: "USD",
    date: "2026-08-01",
    serviceDate: null,
    time: null,
    category: "飲食",
    location: null,
    referenceId: null,
    isUpdate: false,
    ...p,
  };
}

function eventDraft(p: Partial<EventDraft>): EventDraft {
  return {
    kind: "timed",
    title: "ハイキング",
    startDate: "2026-08-01",
    startTime: "09:00",
    endDate: null,
    endTime: null,
    departTz: null,
    arriveTz: null,
    vehicleNumber: null,
    departTerminal: null,
    arriveTerminal: null,
    departLocation: null,
    arriveLocation: null,
    location: null,
    referenceId: null,
    isUpdate: false,
    ...p,
  };
}

const expenseCtx = {
  categories: [
    { id: "cat-food", name: "飲食" },
    { id: "cat-other", name: "その他" },
  ],
  defaultCurrency: "JPY" as const,
  fallbackCategoryId: "cat-other",
  places,
  unknownMerchantLabel: "不明な店",
};

describe("deriveExpenseDraftItems", () => {
  it("カテゴリ名の一致・保存済み場所マッチ・ラベル部品を組み立てる", () => {
    const items = deriveExpenseDraftItems(
      [{ id: "d1", kind: "expense", payload: receipt({}) }],
      expenseCtx,
    );
    expect(items).toHaveLength(1);
    const it1 = items[0];
    expect(it1.labelParts).toEqual(["Kai Coffee", "12.5 USD", "8/1"]);
    expect(it1.initialCategoryId).toBe("cat-food");
    expect(it1.initialCurrency).toBe("USD");
    expect(it1.initialPlace).toEqual({
      kind: "saved",
      id: "kai",
      name: "Kai Coffee",
    });
    expect(it1.autoResolvePlace).toBeNull();
  });

  it("不正通貨は精算通貨に、未知カテゴリは fallback に落ちる", () => {
    const items = deriveExpenseDraftItems(
      [
        {
          id: "d1",
          kind: "expense",
          payload: receipt({ currency: "$", category: "飲食" }),
        },
      ],
      { ...expenseCtx, categories: [{ id: "cat-other", name: "その他" }] },
    );
    expect(items[0].initialCurrency).toBe("JPY");
    expect(items[0].initialCategoryId).toBe("cat-other");
  });

  it("店名が保存済みに当たらなければ autoResolvePlace を持つ", () => {
    const items = deriveExpenseDraftItems(
      [
        {
          id: "d1",
          kind: "expense",
          payload: receipt({ merchant: "Yard House", location: "Lewers St" }),
        },
      ],
      expenseCtx,
    );
    expect(items[0].initialPlace).toBeNull();
    expect(items[0].autoResolvePlace).toEqual({
      name: "Yard House",
      location: "Lewers St",
    });
  });

  it("event 下書きは無視し、merchant 空はフォールバック見出しにする", () => {
    const items = deriveExpenseDraftItems(
      [
        { id: "d1", kind: "event", payload: eventDraft({}) },
        { id: "d2", kind: "expense", payload: receipt({ merchant: "" }) },
      ],
      expenseCtx,
    );
    expect(items).toHaveLength(1);
    expect(items[0].labelParts[0]).toBe("不明な店");
  });
});

const eventCtx = {
  tzTimeline: buildTripTzTimeline([], "Pacific/Honolulu"),
  places,
  locale: "ja",
  untitledLabel: "無題の予定",
  reservationRefLabel: (ref: string) => `予約番号: ${ref}`,
};

describe("deriveEventDraftItems", () => {
  it("旅程からTZを解決し、便名と予約番号をメモに並べる", () => {
    const items = deriveEventDraftItems(
      [
        {
          id: "d1",
          kind: "event",
          payload: eventDraft({
            kind: "transit",
            title: "NRT-HNL",
            startTime: "21:00",
            endDate: "2026-08-01",
            endTime: "09:35",
            departTz: "Asia/Tokyo",
            arriveTz: "Pacific/Honolulu",
            vehicleNumber: "NH184",
            referenceId: "ABC123",
            departLocation: "成田国際空港",
            departTerminal: "Terminal 1",
          }),
        },
      ],
      eventCtx,
    );
    expect(items).toHaveLength(1);
    const it1 = items[0];
    expect(it1.tz).toBe("Pacific/Honolulu");
    expect(it1.date).toBe("2026-08-01");
    expect(it1.time).toBe("21:00");
    expect(it1.prefill.kind3).toBe("transit");
    expect(it1.prefill.note).toBe("NH184 ・ 予約番号: ABC123");
    // 出発地は保存済みに当たらない → ターミナル付き検索語の autoResolve。
    expect(it1.prefill.place).toBeNull();
    expect(it1.prefill.autoResolvePlace).toEqual({
      name: "成田国際空港",
      location: null,
      searchQuery: "成田国際空港 Terminal 1",
    });
  });

  it("timed はタイトルを場所の手がかりにし、保存済みマッチを事前入力する", () => {
    const items = deriveEventDraftItems(
      [
        {
          id: "d1",
          kind: "event",
          payload: eventDraft({ title: "Kai Coffee", startTime: null }),
        },
      ],
      eventCtx,
    );
    expect(items[0].time).toBe("09:00"); // 時刻不明のデフォルト
    expect(items[0].prefill.place).toEqual({
      kind: "saved",
      id: "kai",
      name: "Kai Coffee",
    });
    expect(items[0].prefill.autoResolvePlace).toBeNull();
  });

  it("タイトル空はフォールバック見出し（prefill.title は空のまま）", () => {
    const items = deriveEventDraftItems(
      [{ id: "d1", kind: "event", payload: eventDraft({ title: "" }) }],
      eventCtx,
    );
    expect(items[0].labelParts[0]).toBe("無題の予定");
    expect(items[0].prefill.title).toBe("");
  });
});

describe("draftToScheduleEvent", () => {
  const base: EventDraftItem = {
    id: "d1",
    labelParts: ["NRT-HNL", "8/1 21:00 → 8/1 09:35"],
    date: "2026-08-01",
    time: "21:00",
    tz: "Pacific/Honolulu",
    prefill: {
      kind3: "transit",
      title: "NRT-HNL",
      note: null,
      endDate: "2026-08-01",
      endTime: "09:35",
      departTz: "Asia/Tokyo",
      arriveTz: "Pacific/Honolulu",
      place: null,
      autoResolvePlace: null,
    },
  };

  it("transit は departTz/arriveTz を持つ疑似イベントになる", () => {
    const ev = draftToScheduleEvent(base, "me");
    expect(ev.id).toBe(draftEventId("d1"));
    expect(ev.isDraft).toBe(true);
    expect(ev.kind).toBe("transit");
    expect(ev.startAt).toBe("2026-08-01T21:00");
    expect(ev.endAt).toBe("2026-08-01T09:35");
    expect(ev.startTz).toBe("Asia/Tokyo");
    expect(ev.endTz).toBe("Pacific/Honolulu");
    expect(ev.participantMemberIds).toEqual([]); // 全員のシュガー
    expect(ev.createdByMemberId).toBe("me");
  });

  it("allday は endTime が無いので endAt は null（web と同じ）", () => {
    const ev = draftToScheduleEvent(
      {
        ...base,
        prefill: {
          ...base.prefill,
          kind3: "allday",
          endDate: "2026-08-03",
          endTime: null,
          departTz: null,
          arriveTz: null,
        },
      },
      "me",
    );
    expect(ev.allDay).toBe(true);
    expect(ev.kind).toBe("normal");
    expect(ev.endAt).toBeNull();
    expect(ev.startTz).toBeNull();
  });
});

describe("draftEventId / draftIdFromEventId", () => {
  it("往復し、実イベント id は null", () => {
    expect(draftIdFromEventId(draftEventId("abc"))).toBe("abc");
    expect(draftIdFromEventId("evt-uuid")).toBeNull();
  });
});
