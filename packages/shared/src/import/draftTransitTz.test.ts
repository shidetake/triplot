import { describe, expect, it } from "vitest";

import { deriveEventDraftItems, draftToScheduleEvent } from "./drafts";
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

  it("場所が解決できていなければ先頭候補（出発側）に落ちる", () => {
    const [item] = deriveEventDraftItems(eventDraft({}), ctx);
    expect(item.prefill.tzDisambig).toEqual({
      transitId: "T1",
      side: "depart",
    });
    expect(item.tz).toBe("Asia/Tokyo");
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
