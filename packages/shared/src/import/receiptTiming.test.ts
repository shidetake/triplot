import { describe, expect, it } from "vitest";

import { deriveReceiptEventTiming } from "./receiptTiming";

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
  // sanitizeEventDraft が fromReceipt を見て一度 timed に決めた直後にこの
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
