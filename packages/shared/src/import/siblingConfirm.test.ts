import { describe, expect, it } from "vitest";

import {
  eventFieldsFromDraft,
  expenseFieldsFromDraft,
  placeInputFromDraft,
} from "./siblingConfirm";
import type { EventDraftItem, ExpenseDraftItem } from "./drafts";

// 連動確定は**ユーザーに何も見せずに費用/予定を作る**ので、値が1つ狂っても
// 気付かれない（金額・レート・カテゴリ・場所）。フォームを開いて何も触らず
// 保存したのと同じ結果になることを、ここで固定する。

const expenseDraft = (o: Partial<ExpenseDraftItem> = {}): ExpenseDraftItem => ({
  id: "d1",
  emailId: "e1",
  labelParts: ["Kai Coffee", "12.5 USD", "8/1"],
  tzDisambig: null,
  initialPrice: 12.5,
  initialCurrency: "USD",
  initialCategoryId: "cat-food",
  initialPaidAt: "2026-08-01",
  initialPlace: { kind: "saved", id: "p1", name: "Kai Coffee" },
  autoResolvePlace: null,
  fxRates: null,
  ...o,
});

const expenseCtx = {
  defaultCurrency: "JPY" as const,
  averageRates: { USD: 150 },
  myMemberId: "m1",
  activeMemberIds: ["m1", "m2"],
};

describe("expenseFieldsFromDraft", () => {
  it("下書きの値をそのまま費用にする（支払者=自分・割り勘=全員・shared）", () => {
    const f = expenseFieldsFromDraft(expenseDraft(), expenseCtx);
    expect(f).toEqual({
      localPrice: 12.5,
      localCurrency: "USD",
      rateToDefault: 150,
      categoryId: "cat-food",
      payerMemberId: "m1",
      visibility: "shared",
      splittable: true,
      splitMemberIds: ["m1", "m2"],
      note: "",
      paidAt: "2026-08-01",
      tzDisambigTransitId: null,
      tzDisambigSide: null,
      place: { kind: "saved", placeId: "p1" },
    });
  });

  it("精算通貨と同じならレートは 1（履歴が無くても作れる）", () => {
    const f = expenseFieldsFromDraft(
      expenseDraft({ initialCurrency: "JPY" }),
      { ...expenseCtx, averageRates: {} },
    );
    expect(f?.rateToDefault).toBe(1);
  });

  // ここが「自動で作ってはいけない」唯一のケース。1 で作ると 12.5 円の
  // 費用ができてしまい、しかも誰も気付かない。
  it("履歴の無い外貨はレートが決められないので作らない（null）", () => {
    expect(
      expenseFieldsFromDraft(expenseDraft(), {
        ...expenseCtx,
        averageRates: {},
      }),
    ).toBeNull();
  });

  it("退会者は割り勘の既定に入れない", () => {
    const f = expenseFieldsFromDraft(expenseDraft(), {
      ...expenseCtx,
      activeMemberIds: ["m1"],
    });
    expect(f?.splitMemberIds).toEqual(["m1"]);
  });
});

const eventDraft = (
  prefill: Partial<EventDraftItem["prefill"]> = {},
): EventDraftItem => ({
  id: "d2",
  draftIds: ["d2"],
  emailIds: ["e1"],
  labelParts: ["夕食", "8/1 18:00"],
  date: "2026-08-01",
  time: "18:00",
  tz: "Pacific/Honolulu",
  prefill: {
    kind3: "timed",
    tzDisambig: null,
    title: "夕食",
    note: null,
    endDate: null,
    endTime: "20:00",
    departTz: null,
    arriveTz: null,
    place: { kind: "free", name: "Kai Coffee", lat: 21.3, lng: -157.8 },
    endPlace: null,
    autoResolvePlace: null,
    flightNumber: null,
    ...prefill,
  },
});

describe("eventFieldsFromDraft", () => {
  it("通常の予定（参加者は空＝全員のシュガー、実TZは持たない）", () => {
    expect(eventFieldsFromDraft(eventDraft())).toEqual({
      kind: "normal",
      allDay: false,
      title: "夕食",
      startAt: "2026-08-01T18:00",
      endAt: "2026-08-01T20:00",
      startTz: null,
      endTz: null,
      tzDisambigTransitId: null,
      tzDisambigSide: null,
      visibility: "shared",
      note: "",
      participantMemberIds: [],
      startPlace: {
        kind: "free",
        label: "Kai Coffee",
        coords: { lat: 21.3, lng: -157.8 },
      },
      endPlace: null,
    });
  });

  it("終日は終了日まで伸ばす（endTime が無くても1日に潰れない）", () => {
    const f = eventFieldsFromDraft(
      eventDraft({ kind3: "allday", endDate: "2026-08-05", endTime: null }),
    );
    expect(f.allDay).toBe(true);
    expect(f.startAt).toBe("2026-08-01T00:00:00");
    expect(f.endAt).toBe("2026-08-05T00:00:00");
  });

  it("時差移動だけが実TZを持つ", () => {
    const f = eventFieldsFromDraft(
      eventDraft({
        kind3: "transit",
        departTz: "Asia/Tokyo",
        arriveTz: "Pacific/Honolulu",
      }),
    );
    expect(f.kind).toBe("transit");
    expect(f.startTz).toBe("Asia/Tokyo");
    expect(f.endTz).toBe("Pacific/Honolulu");
  });

  it("移動日に選んだTZの側がそのまま予定に載る", () => {
    const f = eventFieldsFromDraft(
      eventDraft({ tzDisambig: { transitId: "T1", side: "arrive" } }),
    );
    expect(f.tzDisambigTransitId).toBe("T1");
    expect(f.tzDisambigSide).toBe("arrive");
  });
});

describe("placeInputFromDraft", () => {
  it("Google の場所は google_place_id を保って渡す（重複登録を避ける）", () => {
    expect(
      placeInputFromDraft(
        {
          kind: "google",
          placeId: "g1",
          name: "Kai",
          address: "addr",
          lat: 1,
          lng: 2,
          region: null,
          locality: null,
          icon: "restaurant",
        },
        null,
      ),
    ).toEqual({
      kind: "google",
      placeId: "g1",
      name: "Kai",
      address: "addr",
      lat: 1,
      lng: 2,
      region: null,
      locality: null,
      icon: "restaurant",
    });
  });

  it("未解決なら自由入力テキストに落とす（勝手に別の店へ紐づけない）", () => {
    expect(placeInputFromDraft(null, { name: "Kai Coffee" })).toEqual({
      kind: "free",
      label: "Kai Coffee",
    });
  });

  it("手がかりが何も無ければ場所なし", () => {
    expect(placeInputFromDraft(null, null)).toEqual({
      kind: "saved",
      placeId: null,
    });
  });
});

// レートの決め方。実績の平均が最優先で、その通貨の1件目だけ取り込み時の
// 市場レートで埋める（fxRates.ts）。これが無いと、外貨の費用は1件も自動で
// 確定できない（実データで USD のレシート 75 件が黙って残っていた）。
describe("外貨のレート", () => {
  const fx = {
    date: "2026-04-30",
    base: "USD" as const,
    rates: { JPY: 156.56 },
  };
  const ctx = {
    defaultCurrency: "JPY" as const,
    averageRates: {} as Record<string, number>,
    myMemberId: "m1",
    activeMemberIds: ["m1"],
  };

  it("実績が無ければ取り込み時のレートを使う", () => {
    const f = expenseFieldsFromDraft(
      expenseDraft({ initialCurrency: "USD", fxRates: fx }),
      ctx,
    );
    expect(f?.rateToDefault).toBe(156.56);
  });

  it("実績があればそちらが優先（手数料込みの実効レート）", () => {
    const f = expenseFieldsFromDraft(
      expenseDraft({ initialCurrency: "USD", fxRates: fx }),
      { ...ctx, averageRates: { USD: 160 } },
    );
    expect(f?.rateToDefault).toBe(160);
  });

  it("どちらも無ければ作らない（1 で作ると金額が壊れる）", () => {
    expect(
      expenseFieldsFromDraft(expenseDraft({ initialCurrency: "USD" }), ctx),
    ).toBeNull();
  });
});
