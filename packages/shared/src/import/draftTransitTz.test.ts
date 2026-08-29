import { describe, expect, it } from "vitest";

import {
  deriveEventDraftItems,
  deriveEventDraftItemsWithTimeline,
  draftToScheduleEvent,
} from "./drafts";
import { resolveEventTz, type TripTzTimeline } from "../schedule";

// 移動日（同じ暦日に2つの TZ）の下書きについて、
//   「どちらの TZ を選んだか」＝ prefill.tzDisambig が唯一の決定で、
//   フォームの初期選択もカレンダーの列もそこから決まる
// ことを固定する。
//
// 実際に踏んだ不具合: 列だけを別経路で通したせいで、フォームの選択は「日本」
// なのにブロックは「ハワイ」の列に出る、という食い違いが起きた。決定が2箇所に
// 分かれていると必ずこうなるので、1つの値から導かれていることを検査する。

const tzTimeline: TripTzTimeline = {
  fallbackTz: "Asia/Tokyo",
  transits: [
    {
      transitId: "T1",
      departDate: "2026-04-28",
      arriveDate: "2026-04-28",
      departTz: "Asia/Tokyo",
      arriveTz: "Pacific/Honolulu",
      // 成田 19:10 発 → ホノルル 07:25 着（同じ暦日に着く）。
      departTime: "19:10",
      arriveTime: "07:25",
    },
  ],
};

const ctx = {
  tzTimeline,
  places: [],
  locale: "ja",
  untitledLabel: "(無題)",
  reservationRefLabel: (r: string) => `予約番号: ${r}`,
};

function eventDraft(o: { lng?: number; name?: string }) {
  return [
    {
      id: "d1",
      email_id: "e-d1",
      kind: "event",
      payload: {
        kind: "timed",
        title: "夕食",
        startDate: "2026-04-28",
        startTime: "15:12",
        endDate: null,
        endTime: "17:17",
        departTz: null,
        arriveTz: null,
        location: o.name ?? null,
        vehicleNumber: null,
        referenceId: null,
        ...(o.lng === undefined
          ? {}
          : {
              resolvedNamedPlace: {
                placeId: "P1",
                name: o.name ?? "店",
                formattedAddress: "",
                lat: 21.3,
                lng: o.lng,
                region: null,
                locality: null,
                rating: null,
                userRatingCount: null,
                primaryType: "restaurant",
              },
            }),
      },
    },
  ];
}

// フォームの初期選択と同じ引き当て方（web の createDisambig / RN の initDisambig）。
function formSelection(
  prefillTzDisambig: {
    transitId: string;
    side: "depart" | "arrive";
  } | null,
) {
  return prefillTzDisambig;
}

describe("移動日の下書きの TZ", () => {
  it("ホノルルの店なら到着側を選び、フォームの選択と列が一致する", () => {
    const [item] = deriveEventDraftItems(eventDraft({ lng: -157.86 }), ctx);

    // 決定は prefill に1つだけある
    expect(item.prefill.tzDisambig).toEqual({
      transitId: "T1",
      side: "arrive",
    });
    expect(item.tz).toBe("Pacific/Honolulu");

    // カレンダーの列も同じ決定から導かれる
    const ev = draftToScheduleEvent(item, "m1");
    const column = resolveEventTz(
      "2026-04-28",
      ev.tzDisambigTransitId,
      ev.tzDisambigSide,
      tzTimeline,
    );
    expect(column).toBe(item.tz);

    // フォームの初期選択も同じ値
    expect(formSelection(item.prefill.tzDisambig)).toEqual({
      transitId: "T1",
      side: "arrive",
    });
  });

  it("東京の店なら出発側を選ぶ", () => {
    const [item] = deriveEventDraftItems(eventDraft({ lng: 139.69 }), ctx);
    expect(item.prefill.tzDisambig).toEqual({
      transitId: "T1",
      side: "depart",
    });
    expect(item.tz).toBe("Asia/Tokyo");
  });

  // 場所が解決できていないときは時刻で絞る（narrowTzByTime）。移動日の候補は
  // 「出発より前」か「到着より後」でないと成立しないので、片方が消えることがある。
  it("場所が無くても、時刻が出発後なら到着側に決まる", () => {
    // 15:12 は成田 19:10 発より前なので出発側も成立し、絞れない → 先頭候補。
    const [before] = deriveEventDraftItems(eventDraft({}), ctx);
    expect(before.prefill.tzDisambig).toEqual({
      transitId: "T1",
      side: "depart",
    });

    // 21:00 は日本時間なら出発済みなので出発側が消え、到着側に決まる。
    const late = eventDraft({});
    late[0].payload.startTime = "21:00";
    const [item] = deriveEventDraftItems(late, ctx);
    expect(item.prefill.tzDisambig).toEqual({
      transitId: "T1",
      side: "arrive",
    });
    expect(item.tz).toBe("Pacific/Honolulu");
  });

  it("場所も時刻も決め手が無ければ先頭候補（出発側）に落ちる", () => {
    const noTime = eventDraft({});
    noTime[0].payload.startTime = null as unknown as string;
    const [item] = deriveEventDraftItems(noTime, ctx);
    expect(item.prefill.tzDisambig).toEqual({
      transitId: "T1",
      side: "depart",
    });
  });

  it("移動日でなければ決定を持たない（毎回自動導出）", () => {
    const notTransitDay = eventDraft({ lng: -157.86 });
    notTransitDay[0].payload.startDate = "2026-04-29";
    const [item] = deriveEventDraftItems(notTransitDay, ctx);
    expect(item.prefill.tzDisambig).toBeNull();
    const ev = draftToScheduleEvent(item, "m1");
    expect(ev.tzDisambigTransitId).toBeNull();
    expect(ev.tzDisambigSide).toBeNull();
  });
});

describe("終日の下書き", () => {
  function alldayDraft(endDate: string | null) {
    return [
      {
        id: "d1",
        email_id: "e-d1",
        kind: "event",
        payload: {
          kind: "allday",
          title: "The Royal Hawaiian",
          startDate: "2026-04-28",
          startTime: null,
          endDate,
          endTime: null,
          departTz: null,
          arriveTz: null,
          location: null,
          vehicleNumber: null,
          referenceId: null,
        },
      },
    ];
  }

  it("終了日まで伸びる（endTime が無くても1日に潰れない）", () => {
    const [item] = deriveEventDraftItems(alldayDraft("2026-05-04"), ctx);
    const ev = draftToScheduleEvent(item, "m1");
    expect(ev.allDay).toBe(true);
    expect(ev.startAt).toBe("2026-04-28T00:00:00");
    expect(ev.endAt).toBe("2026-05-04T00:00:00");
  });

  it("終了日が無ければ初日だけ", () => {
    const [item] = deriveEventDraftItems(alldayDraft(null), ctx);
    const ev = draftToScheduleEvent(item, "m1");
    expect(ev.endAt).toBe("2026-04-28T00:00:00");
  });
});

// TZ の境界がまだ**仮予定**のフライトの時、下書きの TZ とカレンダーの列が
// 食い違っていた。原因は年表が2つあること:
//   - 下書き側は「確定した予定だけ」の年表で TZ を決める
//   - カレンダーの列は buildSchedule が「確定＋仮」の一覧で組み直す
// 下書きが持つ移動日の選択は列側の年表に存在しない移動を指すので、一致せず
// 先頭候補＝出発側に落ち、ハワイの仮予定が東京の列に並んだ（実機で確認）。
describe("TZ の境界が仮予定のフライトのとき", () => {
  const flightDraft = {
    id: "df",
    email_id: "e-df",
    kind: "event",
    payload: {
      kind: "transit",
      title: "NH184",
      startDate: "2026-04-28",
      startTime: "19:10",
      endDate: "2026-04-28",
      endTime: "07:25",
      departTz: "Asia/Tokyo",
      arriveTz: "Pacific/Honolulu",
      location: null,
      vehicleNumber: "NH184",
      referenceId: null,
    },
  };
  // 到着の翌日、ハワイでの夕食。
  const dinnerDraft = {
    id: "dd",
    email_id: "e-dd",
    kind: "event",
    payload: {
      kind: "timed",
      title: "夕食",
      startDate: "2026-04-29",
      startTime: "18:00",
      endDate: "2026-04-29",
      endTime: "20:00",
      departTz: null,
      arriveTz: null,
      location: null,
      vehicleNumber: null,
      referenceId: null,
    },
  };

  it("同じ年表から導けば、仮予定の夕食も到着側（ハワイ）になる", () => {
    // 確定した予定は1つも無い（フライトもまだ仮予定）。
    const { items, tzTimeline } = deriveEventDraftItemsWithTimeline(
      [flightDraft, dinnerDraft],
      [],
      "Asia/Tokyo",
      {
        places: [],
        locale: "ja",
        untitledLabel: "(無題)",
        reservationRefLabel: (r: string) => `予約番号: ${r}`,
      },
    );
    const dinner = items.find((i) => i.prefill.title === "夕食")!;
    expect(dinner.tz).toBe("Pacific/Honolulu");

    // カレンダーの列を組む年表にも仮予定のフライトが入っている
    // （＝列側と同じ年表。ここが揃っていないと列だけ東京になる）。
    expect(tzTimeline.transits).toHaveLength(1);
    expect(tzTimeline.transits[0].arriveTz).toBe("Pacific/Honolulu");
  });

  // 直す前の挙動。確定した予定だけの年表で導出すると、境界を知らないので
  // 旅行の既定 TZ（東京）のまま＝列と食い違う。差が出ることを固定しておく。
  it("確定した予定だけの年表だと東京のままになる", () => {
    const [dinner] = deriveEventDraftItems([dinnerDraft], {
      tzTimeline: { fallbackTz: "Asia/Tokyo", transits: [] },
      places: [],
      locale: "ja",
      untitledLabel: "(無題)",
      reservationRefLabel: (r: string) => `予約番号: ${r}`,
    });
    expect(dinner.tz).toBe("Asia/Tokyo");
  });
});
