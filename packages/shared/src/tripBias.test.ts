import { describe, expect, it } from "vitest";

import { tripBiasCenter, unassignedBiasCenter } from "./tripBias";

const NRT = { lat: 35.772, lng: 140.393 };
const HNL = { lat: 21.319, lng: -157.922 };

const places = [
  { id: "p-nrt", lat: NRT.lat, lng: NRT.lng },
  { id: "p-hnl", lat: HNL.lat, lng: HNL.lng },
];

const transitEvent = {
  kind: "transit" as const,
  startAt: "2026-04-28T19:10",
  endAt: "2026-04-28T07:25",
  startTz: "Asia/Tokyo",
  endTz: "Pacific/Honolulu",
  startPlaceId: "p-nrt",
  endPlaceId: "p-hnl",
};

const transitDraft = {
  id: "d1",
  email_id: "e1",
  kind: "event",
  payload: {
    kind: "transit",
    startDate: "2026-04-28",
    startTime: "19:10",
    endDate: "2026-04-28",
    endTime: "07:25",
    departTz: "Asia/Tokyo",
    arriveTz: "Pacific/Honolulu",
    resolvedDeparturePlace: { lat: NRT.lat, lng: NRT.lng },
    resolvedArrivalPlace: { lat: HNL.lat, lng: HNL.lng },
  },
};

describe("tripBiasCenter", () => {
  it("確定した移動から「その瞬間いた場所」を返す", () => {
    expect(
      tripBiasCenter({
        events: [transitEvent],
        places,
        drafts: null,
        target: { at: "2026-04-28T12:00", tz: "Asia/Tokyo" },
      }),
    ).toEqual(NRT);
  });

  it("ピンが1つも無くても、未確定の移動の下書きから引ける（作りたての旅行）", () => {
    expect(
      tripBiasCenter({
        events: [],
        places: [],
        drafts: [transitDraft],
        target: { at: "2026-04-29T19:00", tz: "Pacific/Honolulu" },
      }),
    ).toEqual(HNL);
  });

  it("移動が1つも無ければ旅行のピンの中心に落とす", () => {
    expect(
      tripBiasCenter({
        events: [],
        places,
        drafts: null,
        target: { at: "2026-04-29T19:00", tz: "Pacific/Honolulu" },
      }),
    ).toBeDefined();
  });

  it("材料が何も無ければ undefined（バイアス無しで解決を試みない）", () => {
    expect(
      tripBiasCenter({ events: [], places: [], drafts: null, target: null }),
    ).toBeUndefined();
  });
});

// 旅行が決まっていないメールは、同じ受信箱の未割り当ての下書きからバイアスを
// 借りる。材料は移動の下書きで、そこから「端点（時刻と座標）」と「TZ の年表」の
// 両方を取る。
describe("unassignedBiasCenter", () => {
  // 成田 19:10 発 → ホノルル 07:25 着（日付変更線を跨ぐので同じ暦日に着く）。
  const flight = {
    kind: "event",
    payload: {
      kind: "transit",
      startDate: "2026-04-28",
      startTime: "19:10",
      endDate: "2026-04-28",
      endTime: "07:25",
      departTz: "Asia/Tokyo",
      arriveTz: "Pacific/Honolulu",
      resolvedDeparturePlace: { lat: NRT.lat, lng: NRT.lng },
      resolvedArrivalPlace: { lat: HNL.lat, lng: HNL.lng },
    },
  };

  it("到着後の日はホノルルを借りる", () => {
    const c = unassignedBiasCenter([flight], {
      date: "2026-04-30",
      time: "17:25",
    });
    expect(c).toEqual(HNL);
  });

  it("出発より前の日は成田を借りる", () => {
    const c = unassignedBiasCenter([flight], {
      date: "2026-04-27",
      time: "12:00",
    });
    expect(c).toEqual(NRT);
  });

  it("移動の下書きが無ければ借りられない", () => {
    const receiptOnly = [
      { kind: "expense", payload: { date: "2026-04-30", category: "飲食" } },
    ];
    expect(
      unassignedBiasCenter(receiptOnly, { date: "2026-04-30", time: null }),
    ).toBeUndefined();
  });

  // 対象日の TZ が分からないと壁時計を絶対時刻に直せず、「まだ移動していない＝
  // 出発地」に落ちてホノルルのレシートに成田を当ててしまう。TZ の年表も同じ
  // 移動の下書きから組んでいることを、到着後の日で確かめる（上の1本目が
  // ホノルルを返すこと自体がその証拠）。
  it("移動日は候補が2つあり、時刻で絞れなければ出発側に倒れる", () => {
    // 08:30 は日本時間なら出発前・ハワイ時間なら到着後で、どちらも成立する。
    const c = unassignedBiasCenter([flight], {
      date: "2026-04-28",
      time: "08:30",
    });
    expect(c).toEqual(NRT);
  });
});
