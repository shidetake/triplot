import { describe, expect, it } from "vitest";

import { canonicalTimeZone, type EventDraft, sanitizeEventDraft } from "./schema";

function draft(p: Partial<EventDraft>): EventDraft {
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

describe("canonicalTimeZone", () => {
  it("実在する名前は canonical IANA 名に正規化し、幻覚は null", () => {
    expect(canonicalTimeZone("Asia/Tokyo")).toBe("Asia/Tokyo");
    expect(canonicalTimeZone("JST")).toBe("Asia/Tokyo");
    expect(canonicalTimeZone("US/Hawaii")).toBe("Pacific/Honolulu");
    expect(canonicalTimeZone("Asia/Narita")).toBeNull();
  });
});

describe("sanitizeEventDraft", () => {
  it("開始日が不正なら捨てる", () => {
    expect(sanitizeEventDraft(draft({ startDate: "8/1" }))).toBeNull();
    expect(sanitizeEventDraft(draft({ startDate: "2026-13-99" }))).toBeNull();
  });

  it("時刻はゼロ埋めに正規化し、不正は null に落とす", () => {
    expect(sanitizeEventDraft(draft({ startTime: "9:30" }))?.startTime).toBe(
      "09:30",
    );
    const d = sanitizeEventDraft(draft({ startTime: "25:00" }));
    expect(d?.kind).toBe("allday"); // 時刻が落ちた timed は allday に降格
    expect(d?.startTime).toBeNull();
  });

  it("timed で開始時刻が無ければ allday に降格する", () => {
    expect(sanitizeEventDraft(draft({ startTime: null }))?.kind).toBe("allday");
  });

  it("allday は時刻を持たない", () => {
    const d = sanitizeEventDraft(
      draft({
        kind: "allday",
        startTime: "15:00",
        endDate: "2026-08-05",
        endTime: "11:00",
      }),
    );
    expect(d).toMatchObject({
      kind: "allday",
      startTime: null,
      endDate: "2026-08-05",
      endTime: null,
    });
  });

  it("transit は到着（日時）が揃わなければ降格する", () => {
    const noEnd = sanitizeEventDraft(
      draft({ kind: "transit", endDate: null, endTime: null }),
    );
    expect(noEnd?.kind).toBe("timed");
    const noTimes = sanitizeEventDraft(
      draft({ kind: "transit", startTime: null, endDate: "2026-08-01" }),
    );
    expect(noTimes?.kind).toBe("allday");
  });

  it("transit の TZ は実在検証し、不正は null（transit のまま）", () => {
    const d = sanitizeEventDraft(
      draft({
        kind: "transit",
        endDate: "2026-08-01",
        endTime: "09:55",
        departTz: "Asia/Tokyo",
        arriveTz: "Pacific/Hawaii", // 幻覚
      }),
    );
    expect(d).toMatchObject({
      kind: "transit",
      departTz: "Asia/Tokyo",
      arriveTz: null,
    });
  });

  it("transit は日付変更線を跨ぐ逆順（到着日 < 出発日）を許す", () => {
    const d = sanitizeEventDraft(
      draft({
        kind: "transit",
        startDate: "2026-08-02",
        startTime: "00:05",
        endDate: "2026-08-01",
        endTime: "12:00",
        departTz: "Asia/Tokyo",
        arriveTz: "Pacific/Honolulu",
      }),
    );
    expect(d?.endDate).toBe("2026-08-01");
  });

  it("timed/allday の逆順の終了は落とす", () => {
    const d = sanitizeEventDraft(
      draft({ endDate: "2026-07-31", endTime: "10:00" }),
    );
    expect(d?.endDate).toBeNull();
    const sameDay = sanitizeEventDraft(
      draft({ startTime: "18:00", endDate: null, endTime: "10:00" }),
    );
    expect(sameDay?.endTime).toBeNull();
  });

  it("timed 以外は TZ を持たない（normal 予定の参照化モデルと一致）", () => {
    const d = sanitizeEventDraft(
      draft({ departTz: "Asia/Tokyo", arriveTz: "Asia/Tokyo" }),
    );
    expect(d?.departTz).toBeNull();
    expect(d?.arriveTz).toBeNull();
  });

  it("transit は便名・ターミナルを保持する", () => {
    const d = sanitizeEventDraft(
      draft({
        kind: "transit",
        endDate: "2026-08-01",
        endTime: "09:55",
        departTz: "Asia/Tokyo",
        arriveTz: "Pacific/Honolulu",
        vehicleNumber: "NH184",
        departTerminal: "Terminal 1",
        arriveTerminal: "Terminal B",
      }),
    );
    expect(d).toMatchObject({
      vehicleNumber: "NH184",
      departTerminal: "Terminal 1",
      arriveTerminal: "Terminal B",
    });
  });

  it("timed/allday は便名・ターミナルを持たない（transit 降格時も含め）", () => {
    const d = sanitizeEventDraft(
      draft({
        vehicleNumber: "NH184",
        departTerminal: "Terminal 1",
        arriveTerminal: "Terminal B",
      }),
    );
    expect(d).toMatchObject({
      vehicleNumber: null,
      departTerminal: null,
      arriveTerminal: null,
    });
  });

  it("transit は出発地・到着地を別フィールドで保持し、汎用 location は持たない", () => {
    const d = sanitizeEventDraft(
      draft({
        kind: "transit",
        endDate: "2026-08-01",
        endTime: "09:55",
        departTz: "Asia/Tokyo",
        arriveTz: "Pacific/Honolulu",
        departLocation: "成田国際空港",
        arriveLocation: "ダニエル・K・イノウエ国際空港",
        location: "羽田", // LLM が誤って汎用フィールドに詰めても捨てる
      }),
    );
    expect(d).toMatchObject({
      departLocation: "成田国際空港",
      arriveLocation: "ダニエル・K・イノウエ国際空港",
      location: null,
    });
  });

  it("timed/allday は出発地・到着地を持たない（transit 降格時も含め、location は残す）", () => {
    const d = sanitizeEventDraft(
      draft({
        departLocation: "成田国際空港",
        arriveLocation: "ダニエル・K・イノウエ国際空港",
        location: "ダイヤモンドヘッド",
      }),
    );
    expect(d).toMatchObject({
      departLocation: null,
      arriveLocation: null,
      location: "ダイヤモンドヘッド",
    });
  });
});
