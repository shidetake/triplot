import { describe, expect, it } from "vitest";

import { tripBiasCenter } from "./tripBias";

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
