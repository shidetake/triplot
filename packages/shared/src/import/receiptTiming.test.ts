import { describe, expect, it } from "vitest";

import {
  applyReceiptEventTiming,
  deriveReceiptEventTiming,
} from "./receiptTiming";

// レシートの最小形（日付・時刻・使う日）。使う日を持たないレシートが既定。
const r = (date: string, time: string | null, serviceDate: string | null = null) => ({
  date,
  time,
  serviceDate,
});

describe("deriveReceiptEventTiming", () => {
  it("カフェは先払い＝レシート時刻を開始にする", () => {
    const t = deriveReceiptEventTiming("カフェ", r("2026-05-01", "12:00"));
    expect(t).toEqual({
      kind: "timed",
      startDate: "2026-05-01",
      startTime: "12:00",
      endDate: "2026-05-01",
      endTime: "12:30",
    });
  });

  it("夕食は後払い＝レシート時刻を終了にする（2時間遡る）", () => {
    // プロンプト旧記述の例（夕食で23:06のレシート→21:06〜23:06）と同じ値。
    const t = deriveReceiptEventTiming("夕食", r("2026-05-01", "23:06"));
    expect(t).toEqual({
      kind: "timed",
      startDate: "2026-05-01",
      startTime: "21:06",
      endDate: "2026-05-01",
      endTime: "23:06",
    });
  });

  it("開始が遡って前日にまたぐ", () => {
    const t = deriveReceiptEventTiming("夕食", r("2026-05-01", "00:30"));
    expect(t.startDate).toBe("2026-04-30");
    expect(t.startTime).toBe("22:30");
    expect(t.endDate).toBe("2026-05-01");
    expect(t.endTime).toBe("00:30");
  });

  it("見出しが表に無ければその他扱い（1時間）", () => {
    const t = deriveReceiptEventTiming("何か", r("2026-05-01", "10:00"));
    expect(t.startTime).toBe("09:00");
    expect(t.endTime).toBe("10:00");
  });

  // レシート由来の仮予定は常に timed（schema.ts の定義参照）。時刻が無くても
  // 終日には落とさない——根拠の無い時間帯を「作らない」のと、種別を「timed の
  // まま保つ」のは別の話。以前はここで allday に落としていて、
  // sanitizeEventDraft が timeFromReceipt を見て一度 timed に決めた直後にこの
  // 関数が上書きしていた（実データ: 銀行の通知など時刻を持たないレシート由来
  // の仮予定が 108通中2通、結局 allday で保存されていた）。
  it("レシートに時刻が無くても timed のまま、時刻だけ作らない", () => {
    const t = deriveReceiptEventTiming("夕食", r("2026-05-01", null));
    expect(t).toEqual({
      kind: "timed",
      startDate: "2026-05-01",
      startTime: null,
      endDate: null,
      endTime: null,
    });
  });

  // 前売券・航空券のように「買った日」と「使う日」が離れるレシートは、仮予定を
  // 置くべきなのは使う日。買った時刻は使う日の時刻ではないので捨てる（費用の
  // 側と同じ規則＝receiptDate）。実データ: 4/18 に買った Diamond Head の
  // 入場券（利用日 5/2）の仮予定が、購入日の 4/18 16:56 に置かれていた。
  it("使う日が買った日と違うなら、使う日に置いて時刻は作らない", () => {
    const t = deriveReceiptEventTiming("観光", r("2026-04-18", "17:56", "2026-05-02"));
    expect(t).toEqual({
      kind: "timed",
      startDate: "2026-05-02",
      startTime: null,
      endDate: null,
      endTime: null,
    });
  });

  // 同じ日に買ってその場で使うもの（当日券・飲食店の予約）は購入時刻が
  // その日の実在する時刻なので、従来どおり時間帯を作る。
  it("使う日が買った日と同じなら、これまでどおり時刻から時間帯を作る", () => {
    const t = deriveReceiptEventTiming("観光", r("2026-05-02", "14:34", "2026-05-02"));
    expect(t.startDate).toBe("2026-05-02");
    expect(t.startTime).toBe("13:34");
    expect(t.endTime).toBe("14:34");
  });
});

// **対象かどうかは印ではなく観察で決める。** 印（timeFromReceipt）は LLM が付ける
// もので、同じメールでも付いたり付かなかったりする。実データ: カードの利用通知から
// 作られた「Snorkel Rentals at Hanauma Bay」が、ある回は決済時刻を開始に写した時間
// 付きの予定、別の回は印の無い終日の予定になった（メールの中身は変わっていない）。
describe("applyReceiptEventTiming の対象", () => {
  const receipt = {
    date: "2026-04-29",
    time: "10:07",
    serviceDate: null,
  } as never;
  const ev = (over: Record<string, unknown>) =>
    ({
      kind: "timed",
      title: "観光",
      startDate: "2026-04-29",
      startTime: null,
      endDate: null,
      endTime: null,
      timeFromReceipt: false,
      ...over,
    }) as never;

  it("自分の時刻を持たない予定は、印が無くてもレシートから作る", () => {
    const [out] = applyReceiptEventTiming(receipt, [
      ev({ kind: "allday", title: "Snorkel Rentals at Hanauma Bay" }),
    ]) as unknown as Record<string, unknown>[];
    expect(out.startTime).toBe("09:07");
    expect(out.endTime).toBe("10:07");
    expect(out.kind).toBe("timed");
    // 片端は見積もりなので、事実として読み返されないよう印を立てる。
    expect(out.timeFromReceipt).toBe(true);
  });

  it("自分の時刻を持つ予定には触らない（メールに書かれた事実）", () => {
    const [out] = applyReceiptEventTiming(receipt, [
      ev({ title: "Diamond Head State Monument", startTime: "13:00", endTime: "14:00" }),
    ]) as unknown as Record<string, unknown>[];
    expect(out.startTime).toBe("13:00");
    expect(out.timeFromReceipt).toBe(false);
  });

  it("複数日にまたがる終日（宿泊）は1時間の枠にしない", () => {
    const [out] = applyReceiptEventTiming(receipt, [
      ev({ kind: "allday", title: "宿泊", endDate: "2026-05-04" }),
    ]) as unknown as Record<string, unknown>[];
    expect(out.startTime).toBeNull();
    expect(out.kind).toBe("allday");
  });

  it("移動は対象外（年表の境界なので種別を降ろさない）", () => {
    const [out] = applyReceiptEventTiming(receipt, [
      ev({ kind: "transit", title: "Uber" }),
    ]) as unknown as Record<string, unknown>[];
    expect(out.kind).toBe("transit");
    expect(out.startTime).toBeNull();
  });
});
