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
    autoResolveName: string;
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
      autoResolvePlace: o.autoResolveName
        ? { name: o.autoResolveName, address: null }
        : null,
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

  // 実データで踏んだ形。会計は Village(17:12) → Howzit(17:25) の順なのに、
  // Howzit が2時間と見積もられて 15:25 開始になり、前後が入れ替わっていた。
  it("前後は会計時刻で決める（見積もりの長さで順番が変わらない）", () => {
    const receiptMin = (it: { id: string }) =>
      it.id === "village" ? 17 * 60 + 12 : 17 * 60 + 25;
    const out = resolveDraftOverlaps(
      [
        item({
          id: "village",
          time: "16:12",
          endTime: "17:12",
          place: google("P1"),
        }),
        item({
          id: "howzit",
          time: "15:25",
          endTime: "17:25",
          place: google("P2"),
        }),
      ],
      fmt,
      receiptMin,
    );
    const by = Object.fromEntries(
      out.map((i) => [i.id, `${i.time}-${i.prefill.endTime}`]),
    );
    // 重なり区間 15:25-17:12 の中点 16:18 で切る。順番は会計どおり
    // （Village が先、Howzit が後）で入れ替わらない。
    expect(by.village).toBe("16:12-16:18");
    expect(by.howzit).toBe("16:18-17:25");
  });

  it("中点が前の開始を追い越す時は、そこまで下げない（順番を崩さない）", () => {
    // 会計は a(12:10) → b(12:30)。素の中点は 11:50 で a の開始 11:40 より
    // 手前ではないが、b が大きく前倒しされると中点が a の開始を追い越しうる。
    const receiptMin = (it: { id: string }) =>
      it.id === "a" ? 12 * 60 + 10 : 12 * 60 + 30;
    const out = resolveDraftOverlaps(
      [
        item({ id: "a", time: "12:00", endTime: "12:30", place: google("P1") }),
        item({ id: "b", time: "10:00", endTime: "13:00", place: google("P2") }),
      ],
      fmt,
      receiptMin,
    );
    const by = Object.fromEntries(
      out.map((i) => [i.id, `${i.time}-${i.prefill.endTime}`]),
    );
    // 素の中点は 11:15 で a の開始 12:00 より手前＝順番が入れ替わる。
    // そこまで下げず a の開始で止める。
    expect(by.a).toBe("12:00-12:00");
    expect(by.b).toBe("12:00-13:00");
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
    expect(out[1].time).toBe("13:30");
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


// 銀行の利用通知は店名しか持たない（住所も支払時刻も無い）ので、取り込んだ時期に
// よっては場所が解決できない。それでも同じ晩の同じ店なのは店名で分かる。
describe("場所が解決できていない時は店名でまとめる", () => {
  it("決済代行の接頭辞が付いていても同じ店とみなす", () => {
    const out = resolveDraftOverlaps(
      [
        item({
          id: "a",
          time: "16:36",
          endTime: "17:36",
          title: "バー",
          autoResolveName: "SQ *HOWZIT BREWING",
        }),
        item({
          id: "b",
          time: "16:58",
          endTime: "17:58",
          title: "飲食",
          autoResolveName: "HOWZIT BREWING",
        }),
      ],
      fmt,
    );
    expect(out).toHaveLength(1);
    expect(out[0].time).toBe("16:36");
    expect(out[0].prefill.endTime).toBe("17:58");
    expect(out[0].draftIds.sort()).toEqual(["a", "b"]);
  });

  it("別の店舗はまとめない", () => {
    const out = resolveDraftOverlaps(
      [
        item({
          id: "a",
          time: "16:00",
          endTime: "17:00",
          autoResolveName: "ABC #78 HAWAII",
        }),
        item({
          id: "b",
          time: "16:30",
          endTime: "17:30",
          autoResolveName: "ABC #31 HAWAII",
        }),
      ],
      fmt,
    );
    expect(out).toHaveLength(2);
  });

  // 片方だけ解決していると、まとめた1件がどちらの場所を名乗るか決まらない。
  it("解決済みと未解決は混ぜない", () => {
    const out = resolveDraftOverlaps(
      [
        item({
          id: "a",
          time: "16:00",
          endTime: "17:00",
          place: google("P1"),
        }),
        item({
          id: "b",
          time: "16:30",
          endTime: "17:30",
          autoResolveName: "HOWZIT BREWING",
        }),
      ],
      fmt,
    );
    expect(out).toHaveLength(2);
  });
});

// 確定した予定は動かせない障害物。下書きの側を切り詰める。
//
// これが無いと、重なった2件の片方を確定した瞬間にもう片方の調整が消える
// （相手が下書きの集合から抜けて、切る根拠を失う）。実データ: バーと買い物が
// 16:48 で切られていたのに、バーを確定すると買い物が元の 16:12-17:12 に戻り、
// 確定したバーと重なった。
describe("確定した予定を避ける", () => {
  const fixed = (o: {
    startAt: string;
    endAt: string;
    placeKey?: string | null;
  }) => ({
    tz: "Pacific/Honolulu",
    startAt: o.startAt,
    endAt: o.endAt,
    placeKey: o.placeKey ?? null,
  });

  it("前にはみ出していれば終わりを詰める", () => {
    const out = resolveDraftOverlaps(
      [item({ id: "a", time: "16:12", endTime: "17:12", title: "買い物" })],
      fmt,
      () => null,
      [fixed({ startAt: "2026-04-30T16:48", endAt: "2026-04-30T17:58" })],
    );
    expect(out[0].time).toBe("16:12");
    expect(out[0].prefill.endTime).toBe("16:48");
  });

  it("中から始まっていれば始まりを下げる", () => {
    const out = resolveDraftOverlaps(
      [item({ id: "a", time: "17:00", endTime: "18:30", title: "夕食" })],
      fmt,
      () => null,
      [fixed({ startAt: "2026-04-30T16:48", endAt: "2026-04-30T17:58" })],
    );
    expect(out[0].time).toBe("17:58");
    expect(out[0].prefill.endTime).toBe("18:30");
  });

  it("同じ場所なら触らない（吸収させる手段が無い）", () => {
    const out = resolveDraftOverlaps(
      [
        item({
          id: "a",
          time: "16:12",
          endTime: "17:12",
          place: { kind: "saved", id: "P9", name: "店" },
        }),
      ],
      fmt,
      () => null,
      [
        fixed({
          startAt: "2026-04-30T16:48",
          endAt: "2026-04-30T17:58",
          placeKey: "saved:P9",
        }),
      ],
    );
    expect(out[0].prefill.endTime).toBe("17:12");
  });

  it("丸ごと覆われていれば触らない（動かすと消える）", () => {
    const out = resolveDraftOverlaps(
      [item({ id: "a", time: "17:00", endTime: "17:30" })],
      fmt,
      () => null,
      [fixed({ startAt: "2026-04-30T16:48", endAt: "2026-04-30T17:58" })],
    );
    expect(out[0].time).toBe("17:00");
    expect(out[0].prefill.endTime).toBe("17:30");
  });
});

// 配車・タクシーも「移動」なので、通常の予定の見積もりが食い込んではいけない
// （車に乗っている間に店にはいられない）。乗車時刻はレシートに書いてある事実で、
// 推測ではないので動かさない。
describe("移動を避ける", () => {
  const ride = (o: { time: string; endTime: string }): EventDraftItem => ({
    ...item({ id: "ride", time: o.time, endTime: o.endTime, title: "Uber" }),
    prefill: {
      ...item({ id: "ride", time: o.time, endTime: o.endTime, title: "Uber" })
        .prefill,
      kind3: "transit",
    },
  });

  it("移動に食い込む見積もりを切り詰める", () => {
    const out = resolveDraftOverlaps(
      [
        item({ id: "cafe", time: "10:44", endTime: "11:14", title: "カフェ" }),
        ride({ time: "11:00", endTime: "11:07" }),
      ],
      fmt,
    );
    const cafe = out.find((o) => o.id === "cafe")!;
    expect(cafe.prefill.endTime).toBe("11:00");
    // 移動そのものは動かさない。
    const r = out.find((o) => o.id === "ride")!;
    expect(r.time).toBe("11:00");
    expect(r.prefill.endTime).toBe("11:07");
  });

  it("移動の後ろから始まる予定は前にずらす", () => {
    const out = resolveDraftOverlaps(
      [
        item({ id: "shop", time: "11:03", endTime: "12:03", title: "買い物" }),
        ride({ time: "11:00", endTime: "11:07" }),
      ],
      fmt,
    );
    expect(out.find((o) => o.id === "shop")!.time).toBe("11:07");
  });
});
