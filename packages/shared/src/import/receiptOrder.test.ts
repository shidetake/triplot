import { describe, expect, it } from "vitest";

import { enforceReceiptOrder } from "./draftOverlap";
import type { EventDraftItem } from "./drafts";

// レシート由来の仮予定は「会計時刻＝終了」で、開始は所要時間ぶん遡って作る。
// この所要時間は LLM の見積もりなので、後の会計の方が長く見積もられると
// 開始が前の会計より早くなり、実際の順番と逆に並ぶ。会計の前後は事実なので、
// 見積もりがそれをひっくり返さないことをここで固定する。

function item(o: {
  id: string;
  start: string;
  end: string;
  title?: string;
}): EventDraftItem {
  return {
    id: o.id,
    draftIds: [o.id],
    emailIds: [`e-${o.id}`],
    labelParts: [o.title ?? o.id, `4/30 ${o.start}`],
    date: "2026-04-30",
    time: o.start,
    tz: "Pacific/Honolulu",
    prefill: {
      kind3: "timed",
      tzDisambig: null,
      title: o.title ?? o.id,
      note: null,
      endDate: null,
      endTime: o.end,
      departTz: null,
      arriveTz: null,
      place: null,
      endPlace: null,
      autoResolvePlace: null,
      flightNumber: null,
    },
  };
}

const when = (_d: string, t: string) => `4/30 ${t}`;
// 会計時刻＝終了時刻とみなす（後払いの業態）。
const receiptFromEnd = (it: EventDraftItem) => {
  const [hh, mm] = (it.prefill.endTime ?? "00:00").split(":").map(Number);
  return hh * 60 + mm;
};
const span = (it: EventDraftItem) => `${it.time}-${it.prefill.endTime}`;

describe("enforceReceiptOrder", () => {
  it("実データの逆転を直す（Village 17:12 の後に Howzit 17:25）", () => {
    const out = enforceReceiptOrder(
      [
        item({ id: "village", start: "16:12", end: "17:12", title: "買い物" }),
        item({ id: "howzit", start: "15:25", end: "17:25", title: "バー" }),
      ],
      receiptFromEnd,
      when,
    );
    const by = Object.fromEntries(out.map((i) => [i.id, span(i)]));
    // 前（Village）は動かさない。後ろ（Howzit）は前の終了直後から始める。
    expect(by.village).toBe("16:12-17:12");
    expect(by.howzit).toBe("17:12-17:25");
  });

  it("長い見積もりは潰さず、前の終了直後にずらす", () => {
    const out = enforceReceiptOrder(
      [
        item({ id: "a", start: "14:00", end: "15:00" }),
        // 会計は後（16:00）なのに2時間見積もりで 14:00 より前から始まっている
        item({ id: "b", start: "13:30", end: "16:00" }),
      ],
      receiptFromEnd,
      when,
    );
    const by = Object.fromEntries(out.map((i) => [i.id, span(i)]));
    expect(by.a).toBe("14:00-15:00");
    // 長さを1時間に切ったりせず、前の終了（15:00）から始める。
    expect(by.b).toBe("15:00-16:00");
  });

  it("同着は逆転ではないので触らない（重なりの解消は分割処理の担当）", () => {
    const out = enforceReceiptOrder(
      [
        item({ id: "a", start: "12:00", end: "13:00" }),
        item({ id: "b", start: "12:00", end: "14:00" }),
      ],
      receiptFromEnd,
      when,
    );
    expect(out.map(span)).toEqual(["12:00-13:00", "12:00-14:00"]);
  });

  it("終了（＝会計時刻）は事実なので動かさない", () => {
    const out = enforceReceiptOrder(
      [
        item({ id: "a", start: "16:12", end: "17:12" }),
        item({ id: "b", start: "15:25", end: "17:25" }),
      ],
      receiptFromEnd,
      when,
    );
    expect(out.map((i) => i.prefill.endTime)).toEqual(["17:12", "17:25"]);
  });

  it("逆転していなければ何も変えない", () => {
    const out = enforceReceiptOrder(
      [
        item({ id: "a", start: "12:00", end: "13:00" }),
        item({ id: "b", start: "14:00", end: "15:00" }),
      ],
      receiptFromEnd,
      when,
    );
    expect(out.map(span)).toEqual(["12:00-13:00", "14:00-15:00"]);
  });

  it("会計時刻が分からないものは自分の開始を順序の根拠にする", () => {
    const out = enforceReceiptOrder(
      [
        item({ id: "a", start: "12:00", end: "13:00" }),
        item({ id: "b", start: "14:00", end: "15:00" }),
      ],
      () => null,
      when,
    );
    expect(out.map(span)).toEqual(["12:00-13:00", "14:00-15:00"]);
  });

  it("見出しの日時部分も直した開始に合わせる", () => {
    const out = enforceReceiptOrder(
      [
        item({ id: "a", start: "16:12", end: "17:12" }),
        item({ id: "b", start: "15:25", end: "17:25" }),
      ],
      receiptFromEnd,
      when,
    );
    expect(out.find((i) => i.id === "b")!.labelParts[1]).toBe("4/30 17:12");
  });
});
