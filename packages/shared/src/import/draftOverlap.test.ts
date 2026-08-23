import { describe, expect, it } from "vitest";

import { resolveDraftOverlaps } from "./draftOverlap";
import type { EventDraftItem } from "./drafts";

const fmt = (date: string, time: string) => `${date} ${time}`;

function item(
  o: Partial<{
    id: string;
    date: string;
    time: string;
    endTime: string | null;
    endDate: string | null;
    title: string;
    place: EventDraftItem["prefill"]["place"];
    kind3: "timed" | "allday" | "transit";
    tz: string;
    note: string | null;
  }> = {},
): EventDraftItem {
  const id = o.id ?? "d1";
  const date = o.date ?? "2026-04-30";
  const time = o.time ?? "12:00";
  return {
    id,
    draftIds: [id],
    emailIds: [`e-${id}`],
    labelParts: [o.title ?? "夕食", fmt(date, time)],
    date,
    time,
    tz: o.tz ?? "Pacific/Honolulu",
    prefill: {
      kind3: o.kind3 ?? "timed",
      tzDisambig: null,
      title: o.title ?? "夕食",
      note: o.note ?? null,
      endDate: o.endDate ?? null,
      endTime: o.endTime === undefined ? "14:00" : o.endTime,
      departTz: null,
      arriveTz: null,
      place: o.place ?? null,
      endPlace: null,
      autoResolvePlace: null,
      flightNumber: null,
    },
  };
}

const google = (placeId: string) =>
  ({
    kind: "google",
    placeId,
    name: "店",
    address: "",
    lat: 0,
    lng: 0,
    region: null,
    locality: null,
    icon: "restaurant",
  }) as EventDraftItem["prefill"]["place"];

describe("resolveDraftOverlaps", () => {
  it("同じ場所で重なったら1件にまとめ、時間帯を和集合にする", () => {
    const out = resolveDraftOverlaps(
      [
        item({ id: "a", time: "15:25", endTime: "17:25", place: google("P1") }),
        item({ id: "b", time: "16:36", endTime: "17:36", place: google("P1") }),
      ],
      fmt,
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("a");
    expect(out[0].time).toBe("15:25");
    expect(out[0].prefill.endTime).toBe("17:36");
    // 畳んだ側も確定時に解決したいので id を持ち越す
    expect(out[0].draftIds).toEqual(["a", "b"]);
  });

  it("同じ場所が3件重なっても全部まとまる", () => {
    const out = resolveDraftOverlaps(
      [
        item({ id: "a", time: "15:25", endTime: "17:25", place: google("P1") }),
        item({ id: "b", time: "16:36", endTime: "17:36", place: google("P1") }),
        item({ id: "c", time: "16:54", endTime: "17:54", place: google("P1") }),
      ],
      fmt,
    );
    expect(out).toHaveLength(1);
    expect(out[0].draftIds).toEqual(["a", "b", "c"]);
    expect(out[0].prefill.endTime).toBe("17:54");
  });

  it("違う場所で重なったら重なり区間の中点で切る", () => {
    const out = resolveDraftOverlaps(
      [
        item({ id: "a", time: "12:00", endTime: "14:00", place: google("P1") }),
        item({ id: "b", time: "13:00", endTime: "15:00", place: google("P2") }),
      ],
      fmt,
    );
    expect(out).toHaveLength(2);
    expect(out[0].prefill.endTime).toBe("13:30");
    expect(out[1].time).toBe("13:30");
    expect(out[1].prefill.endTime).toBe("15:00");
    // 開始が動いた側はラベルも作り直す
    expect(out[1].labelParts[1]).toBe("2026-04-30 13:30");
  });

  it("重なっていなければ何もしない", () => {
    const input = [
      item({ id: "a", time: "12:00", endTime: "13:00", place: google("P1") }),
      item({ id: "b", time: "13:00", endTime: "14:00", place: google("P2") }),
    ];
    expect(resolveDraftOverlaps(input, fmt)).toEqual(input);
  });

  it("場所が解決できていなければ、重なってもまとめない（切るだけ）", () => {
    // タイトルが同じでも場所が無ければ同一店とみなさない。
    const out = resolveDraftOverlaps(
      [
        item({ id: "a", time: "12:00", endTime: "14:00", title: "バー" }),
        item({ id: "b", time: "13:00", endTime: "15:00", title: "バー" }),
      ],
      fmt,
    );
    expect(out).toHaveLength(2);
    expect(out[0].prefill.endTime).toBe("13:30");
  });

  it("宿泊・移動は重なっても触らない", () => {
    const input = [
      item({ id: "a", time: "12:00", endTime: "20:00", kind3: "allday" }),
      item({ id: "b", time: "13:00", endTime: "15:00", kind3: "transit" }),
    ];
    expect(resolveDraftOverlaps(input, fmt)).toEqual(input);
  });

  it("終了時刻が無いものは対象外", () => {
    const input = [
      item({ id: "a", time: "12:00", endTime: null }),
      item({ id: "b", time: "12:30", endTime: null }),
    ];
    expect(resolveDraftOverlaps(input, fmt)).toEqual(input);
  });

  it("タイムゾーンが違うものは比べない", () => {
    const input = [
      item({ id: "a", time: "12:00", endTime: "14:00", tz: "Asia/Tokyo" }),
      item({
        id: "b",
        time: "13:00",
        endTime: "15:00",
        tz: "Pacific/Honolulu",
      }),
    ];
    expect(resolveDraftOverlaps(input, fmt)).toEqual(input);
  });

  it("まとめる時は「買い物」より飲食側の見出しを優先する", () => {
    // 飲食店で食べたあと同じ店の物販で払う形。実態は夕食なのでそちらを残す。
    const out = resolveDraftOverlaps(
      [
        item({
          id: "a",
          time: "18:00",
          endTime: "20:00",
          title: "買い物",
          place: google("P1"),
        }),
        item({
          id: "b",
          time: "19:00",
          endTime: "21:00",
          title: "夕食",
          place: google("P1"),
        }),
      ],
      fmt,
    );
    expect(out).toHaveLength(1);
    expect(out[0].prefill.title).toBe("夕食");
    expect(out[0].labelParts[0]).toBe("夕食");
  });

  it("どちらも「買い物」なら先に始まった方の見出しを残す", () => {
    const out = resolveDraftOverlaps(
      [
        item({
          id: "a",
          time: "18:00",
          endTime: "20:00",
          title: "買い物",
          place: google("P1"),
        }),
        item({
          id: "b",
          time: "19:00",
          endTime: "21:00",
          title: "土産",
          place: google("P1"),
        }),
      ],
      fmt,
    );
    expect(out[0].prefill.title).toBe("買い物");
  });

  it("メモは両方残す", () => {
    const out = resolveDraftOverlaps(
      [
        item({
          id: "a",
          time: "18:00",
          endTime: "20:00",
          note: "予約番号: 1",
          place: google("P1"),
        }),
        item({
          id: "b",
          time: "19:00",
          endTime: "21:00",
          note: "予約番号: 2",
          place: google("P1"),
        }),
      ],
      fmt,
    );
    expect(out[0].prefill.note).toBe("予約番号: 1 ・ 予約番号: 2");
  });

  it("日を跨いで終わる重なりも扱える", () => {
    const out = resolveDraftOverlaps(
      [
        item({ id: "a", time: "22:00", endTime: "23:30", place: google("P1") }),
        item({
          id: "b",
          time: "23:00",
          endTime: "01:00",
          endDate: "2026-05-01",
          place: google("P1"),
        }),
      ],
      fmt,
    );
    expect(out).toHaveLength(1);
    expect(out[0].prefill.endDate).toBe("2026-05-01");
    expect(out[0].prefill.endTime).toBe("01:00");
  });
});

describe("draftToScheduleEvent（見出しと移動日の列）", () => {
  it("まとめても見出しは素のまま（件数などを足さない）", async () => {
    const { draftToScheduleEvent } = await import("./drafts");
    const merged = {
      ...item({ id: "a", place: google("P1") }),
      draftIds: ["a", "b", "c", "d"],
    };
    expect(draftToScheduleEvent(merged, "m1").title).toBe("夕食");
  });

  it("移動日に選んだ側をカレンダーへ渡す（列の判定に要る）", async () => {
    const { draftToScheduleEvent } = await import("./drafts");
    const base = item({ id: "a" });
    const withTz = {
      ...base,
      prefill: {
        ...base.prefill,
        tzDisambig: { transitId: "t1", side: "arrive" as const },
      },
    };
    const ev = draftToScheduleEvent(withTz, "m1");
    expect(ev.tzDisambigTransitId).toBe("t1");
    expect(ev.tzDisambigSide).toBe("arrive");
  });
});
