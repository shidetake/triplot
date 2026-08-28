import { describe, expect, it } from "vitest";

import { inboxRowSummary } from "./inboxRowSummary";
import type { InboxRow } from "./inboxRows";

const row = (over: Partial<InboxRow>): InboxRow => ({
  id: "e1",
  receipt: null,
  events: [],
  own: null,
  assignedTripId: null,
  defaultTripId: "",
  children: [],
  ...over,
});

const opts = {
  locale: "ja",
  subject: null,
  fallbackTitle: "(店名不明)",
  formatAmount: (t: number, c: string) => `${t} ${c}`,
};

const receipt = (over: object = {}) =>
  ({
    merchant: "Uber",
    total: 20.94,
    currency: "USD",
    category: "現地移動",
    date: "2026-05-03",
    serviceDate: null,
    time: null,
    location: null,
    referenceId: null,
    isUpdate: false,
    ...over,
  }) as InboxRow["receipt"];

const event = (over: object = {}) =>
  ({
    kind: "timed",
    title: "移動",
    startDate: "2026-05-02",
    startTime: "15:14",
    endDate: "2026-05-02",
    endTime: "15:31",
    location: null,
    departLocation: null,
    arriveLocation: null,
    departTz: null,
    arriveTz: null,
    vehicleNumber: null,
    departTerminal: null,
    arriveTerminal: null,
    referenceId: null,
    isUpdate: false,
    ...over,
  }) as unknown as InboxRow["events"][number];

describe("inboxRowSummary", () => {
  it("名前は店名。カテゴリと予定タイトルは載せない（旅行の判断に効かない）", () => {
    const s = inboxRowSummary(row({ receipt: receipt(), events: [event()] }), opts);
    expect(s.title).toBe("Uber");
    expect(s.parts.join(" ")).not.toContain("現地移動");
    expect(s.parts.join(" ")).not.toContain("移動");
  });

  it("日時は費用の使った日時。仮予定の開始時刻は使わない（後払いは遡っている）", () => {
    // 夕食で 23:06 のレシート → 仮予定の開始は 21:06。出したいのは 23:06 の方。
    const s = inboxRowSummary(
      row({
        receipt: receipt({ date: "2026-05-02", time: "23:06" }),
        events: [event({ startDate: "2026-05-02", startTime: "21:06" })],
      }),
      opts,
    );
    expect(s.parts).toEqual(["20.94 USD", "5/2(土) 23:06"]);
  });

  it("使う日（serviceDate）があればそちらを採る", () => {
    const s = inboxRowSummary(
      row({ receipt: receipt({ serviceDate: "2026-04-28" }) }),
      opts,
    );
    expect(s.parts).toEqual(["20.94 USD", "4/28(火)"]);
  });

  it("費用が無いメールのときだけ予定の開始日時を使う", () => {
    const s = inboxRowSummary(row({ events: [event()] }), opts);
    expect(s.parts).toEqual(["5/2(土) 15:14"]);
  });

  it("場所は費用のものを優先し、無ければ予定から取る", () => {
    const withReceiptPlace = inboxRowSummary(
      row({
        receipt: receipt({ location: "Ala Moana Center" }),
        events: [event({ arriveLocation: "HNL" })],
      }),
      opts,
    );
    expect(withReceiptPlace.parts.at(-1)).toBe("Ala Moana Center");

    // 移動は出発地を採る（到着地だと帰りの便で地元が出てしまう）。
    const fromEvent = inboxRowSummary(
      row({
        receipt: receipt(),
        events: [
          event({
            kind: "transit",
            departLocation: "412 Lewers St, Honolulu",
            arriveLocation: "HNL 空港",
          }),
        ],
      }),
      opts,
    );
    expect(fromEvent.parts.at(-1)).toBe("412 Lewers St, Honolulu");
  });

  it("場所は解決済みの都市名を優先する（生の文字列より短く、判断に効く）", () => {
    const s = inboxRowSummary(
      row({
        receipt: receipt({
          merchant: "HONOLULU COOKIE CO",
          // 接頭辞は merchant からだけ落とすので、生の文字列とは一致しない。
          location: "SQ *HONOLULU COOKIE CO",
          resolvedPlace: {
            placeId: "g-1",
            name: "Honolulu Cookie Company",
            formattedAddress: "1450 Ala Moana Blvd, Honolulu, HI",
            lat: 21.29,
            lng: -157.84,
            region: "HI",
            locality: "Honolulu",
            rating: null,
            userRatingCount: null,
            primaryType: null,
          },
        }),
      }),
      opts,
    );
    expect(s.parts.at(-1)).toBe("Honolulu");
  });

  // 閾値 0.6 は本番の下書きの実測から。名前が場所に占める割合の分布に谷があり、
  // 0.76 以上（接頭辞が付いただけ）と 0.40 以下（住所付き）の間が空だった。
  describe("場所が名前を言い直しているだけなら出さない", () => {
    const place = (merchant: string, location: string) =>
      inboxRowSummary(row({ receipt: receipt({ merchant, location }) }), opts)
        .parts.at(-1);

    it("完全一致（1.00）は出さない", () => {
      expect(place("THE ROYAL BAKERY", "THE ROYAL BAKERY")).toBe("5/3(日)");
    });

    it("接頭辞が付いただけ（0.76）は出さない", () => {
      expect(place("HANA KOA BREWING", "TST* HANA KOA BREWING")).toBe("5/3(日)");
    });

    it("住所付き（0.26）は出す — 都市名という判断材料がある", () => {
      expect(
        place("Howzit Brewing", "Howzit Brewing, 330 Kamani St, Honolulu, HI"),
      ).toBe("Howzit Brewing, 330 Kamani St, Honolulu, HI");
    });

    it("名前を含まない場所はそのまま出す", () => {
      expect(place("SSA - HANAUMA BAY", "Hanauma Bay, Honolulu, HI")).toBe(
        "Hanauma Bay, Honolulu, HI",
      );
    });
  });

  it("何も取れなければ件名、それも無ければ既定の名前", () => {
    expect(inboxRowSummary(row({}), { ...opts, subject: "Fwd: 領収書" }).title)
      .toBe("Fwd: 領収書");
    expect(inboxRowSummary(undefined, opts).title).toBe("(店名不明)");
  });
});
