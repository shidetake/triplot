import { describe, expect, it } from "vitest";

import type { Flight } from "../flight";
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

function flightFixture(p: Partial<Flight> = {}): Flight {
  return {
    number: "ZG002",
    airlineName: "ZIPAIR Tokyo",
    aircraftModel: null,
    departure: {
      iata: "NRT",
      icao: "RJAA",
      name: "Tokyo Narita",
      municipality: "Tokyo",
      lat: 35.76,
      lng: 140.39,
      timeZone: "Asia/Tokyo",
      terminal: "1",
      scheduledLocal: "2026-08-01T19:10",
    },
    arrival: {
      iata: "HNL",
      icao: "PHNL",
      name: "Honolulu",
      municipality: "Honolulu",
      lat: 21.32,
      lng: -157.92,
      timeZone: "Pacific/Honolulu",
      terminal: null,
      scheduledLocal: "2026-08-01T07:25",
    },
    source: { kind: "actual" },
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

  it("店名が保存済みに当たらなくても事前解決済みの Google の場所があればそれを使う", () => {
    const items = deriveExpenseDraftItems(
      [
        {
          id: "d1",
          kind: "expense",
          payload: {
            ...receipt({ merchant: "Yard House", location: "Lewers St" }),
            resolvedPlace: {
              placeId: "g-yard-house",
              name: "Yard House",
              formattedAddress: "2301 Kalakaua Ave, Honolulu",
              lat: 21.28,
              lng: -157.83,
              region: "Hawaii",
              locality: "Honolulu",
              rating: null,
              userRatingCount: null,
              primaryType: "restaurant",
            },
          },
        },
      ],
      expenseCtx,
    );
    expect(items[0].initialPlace).toEqual({
      kind: "google",
      placeId: "g-yard-house",
      name: "Yard House",
      address: "2301 Kalakaua Ave, Honolulu",
      lat: 21.28,
      lng: -157.83,
      region: "Hawaii",
      locality: "Honolulu",
      icon: "food",
    });
    // Google 解決済みなので web のクライアント側自動解決は不要。
    expect(items[0].autoResolvePlace).toBeNull();
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
    // 便名として解釈できる vehicleNumber は正規形で flightNumber にも入る
    // （確定フォームがフライト番号機能を自動起動するのに使う）。
    expect(it1.prefill.flightNumber).toBe("NH184");
  });

  it("vehicleNumber が便名として解釈できない（列車等）ときは flightNumber は null", () => {
    const items = deriveEventDraftItems(
      [
        {
          id: "d1",
          kind: "event",
          payload: eventDraft({
            kind: "transit",
            title: "東京-新大阪",
            vehicleNumber: "のぞみ23号",
          }),
        },
      ],
      eventCtx,
    );
    expect(items[0].prefill.note).toBe("のぞみ23号");
    expect(items[0].prefill.flightNumber).toBeNull();
  });

  it("事前解決済みフライトがあれば applyFlight と同じ組み立てになる（予約番号を混ぜない・便名ピッカーを再起動しない）", () => {
    const items = deriveEventDraftItems(
      [
        {
          id: "d1",
          kind: "event",
          payload: {
            ...eventDraft({
              kind: "transit",
              title: "NRT-HNL",
              vehicleNumber: "ZG002",
              referenceId: "ABC123",
              departLocation: "成田国際空港",
            }),
            resolvedFlight: flightFixture(),
          },
        },
      ],
      eventCtx,
    );
    expect(items).toHaveLength(1);
    const it1 = items[0];
    expect(it1.date).toBe("2026-08-01");
    expect(it1.time).toBe("19:10");
    expect(it1.prefill.title).toBe("ZG002 Tokyo → Honolulu");
    // 予約番号・便名の生テキストは混ぜない（手動でフライト番号機能を使った
    // 時と同じくターミナルのメモだけ）。
    expect(it1.prefill.note).toBe("Terminal 1 → --");
    expect(it1.prefill.endDate).toBe("2026-08-01");
    expect(it1.prefill.endTime).toBe("07:25");
    // 座標があるので TZ は座標から導出させる（上書きしない）。
    expect(it1.prefill.departTz).toBeNull();
    expect(it1.prefill.arriveTz).toBeNull();
    expect(it1.prefill.place).toEqual({
      kind: "free",
      name: "Tokyo Narita",
      lat: 35.76,
      lng: 140.39,
    });
    expect(it1.prefill.endPlace).toEqual({
      kind: "free",
      name: "Honolulu",
      lat: 21.32,
      lng: -157.92,
    });
    // 確定済み相当なのでフライト番号機能を再起動させない。
    expect(it1.prefill.flightNumber).toBeNull();
  });

  it("空港が Google の場所に解決できていれば座標つき自由入力より優先する", () => {
    const items = deriveEventDraftItems(
      [
        {
          id: "d1",
          kind: "event",
          payload: {
            ...eventDraft({
              kind: "transit",
              title: "NRT-HNL",
              vehicleNumber: "ZG002",
            }),
            resolvedFlight: flightFixture(),
            resolvedDeparturePlace: {
              placeId: "g-narita",
              name: "成田国際空港",
              formattedAddress: "千葉県成田市",
              lat: 35.7647,
              lng: 140.3864,
              region: "千葉県",
              locality: "成田市",
              rating: null,
              userRatingCount: null,
              primaryType: "airport",
            },
            resolvedArrivalPlace: null,
          },
        },
      ],
      eventCtx,
    );
    const it1 = items[0];
    // 出発地は Google 解決できたので google kind（手動確定と同じ google_place_id
    // になり、表記違いでの重複登録を DB 側のデデュープに頼らず避けられる）。
    expect(it1.prefill.place).toEqual({
      kind: "google",
      placeId: "g-narita",
      name: "成田国際空港",
      address: "千葉県成田市",
      lat: 35.7647,
      lng: 140.3864,
      region: "千葉県",
      locality: "成田市",
      icon: "airport",
    });
    // 到着地は解決できなかったので座標つき自由入力にフォールバック。
    expect(it1.prefill.endPlace).toEqual({
      kind: "free",
      name: "Honolulu",
      lat: 21.32,
      lng: -157.92,
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

  it("timed で保存済みに当たらなくても事前解決済みの Google の場所があればそれを使う", () => {
    const items = deriveEventDraftItems(
      [
        {
          id: "d1",
          kind: "event",
          payload: {
            ...eventDraft({ title: "Yard House", location: "Lewers St" }),
            resolvedNamedPlace: {
              placeId: "g-yard-house",
              name: "Yard House",
              formattedAddress: "2301 Kalakaua Ave, Honolulu",
              lat: 21.28,
              lng: -157.83,
              region: "Hawaii",
              locality: "Honolulu",
              rating: null,
              userRatingCount: null,
              primaryType: "restaurant",
            },
          },
        },
      ],
      eventCtx,
    );
    expect(items[0].prefill.place).toEqual({
      kind: "google",
      placeId: "g-yard-house",
      name: "Yard House",
      address: "2301 Kalakaua Ave, Honolulu",
      lat: 21.28,
      lng: -157.83,
      region: "Hawaii",
      locality: "Honolulu",
      icon: null,
    });
    expect(items[0].prefill.autoResolvePlace).toBeNull();
  });

  it("transit（未解決フライト）は resolvedNamedPlace を無視する", () => {
    const items = deriveEventDraftItems(
      [
        {
          id: "d1",
          kind: "event",
          payload: {
            ...eventDraft({
              kind: "transit",
              title: "NRT-HNL",
              departLocation: "成田国際空港",
            }),
            // transit 用ではないので無視されるべき（誤って event.kind !== "transit"
            // のガードが外れていないかの回帰チェック）。
            resolvedNamedPlace: {
              placeId: "g-wrong",
              name: "誤った候補",
              formattedAddress: "",
              lat: 0,
              lng: 0,
              region: null,
              locality: null,
              rating: null,
              userRatingCount: null,
              primaryType: null,
            },
          },
        },
      ],
      eventCtx,
    );
    expect(items[0].prefill.place).toBeNull();
    expect(items[0].prefill.autoResolvePlace).toEqual({
      name: "成田国際空港",
      location: null,
      searchQuery: undefined,
    });
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
    draftIds: ["d1"],
    labelParts: ["NRT-HNL", "8/1 21:00 → 8/1 09:35"],
    date: "2026-08-01",
    time: "21:00",
    tz: "Pacific/Honolulu",
    prefill: {
      kind3: "transit",
      tzDisambig: null,
      title: "NRT-HNL",
      note: null,
      endDate: "2026-08-01",
      endTime: "09:35",
      departTz: "Asia/Tokyo",
      arriveTz: "Pacific/Honolulu",
      place: null,
      endPlace: null,
      autoResolvePlace: null,
      flightNumber: null,
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

  // かつては「endTime が無いので endAt は null」を仕様として固定していたが、
  // それだと複数日の宿泊が初日だけの1日予定に化けていた（実機で発覚）。
  // 終日は時刻を持たないので、日付だけで組み立てるのが正しい。
  it("allday は終了日まで伸びる（時刻を持たないので日付で組み立てる）", () => {
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
    expect(ev.startAt).toBe("2026-08-01T00:00:00");
    expect(ev.endAt).toBe("2026-08-03T00:00:00");
    expect(ev.startTz).toBeNull();
  });
});

describe("draftEventId / draftIdFromEventId", () => {
  it("往復し、実イベント id は null", () => {
    expect(draftIdFromEventId(draftEventId("abc"))).toBe("abc");
    expect(draftIdFromEventId("evt-uuid")).toBeNull();
  });
});
