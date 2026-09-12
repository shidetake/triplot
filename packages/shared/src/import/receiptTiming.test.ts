import { describe, expect, it } from "vitest";

import { deriveReceiptEventTiming } from "./receiptTiming";

describe("deriveReceiptEventTiming", () => {
  it("カフェは先払い＝レシート時刻を開始にする", () => {
    const t = deriveReceiptEventTiming("カフェ", "2026-05-01", "12:00");
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
    const t = deriveReceiptEventTiming("夕食", "2026-05-01", "23:06");
    expect(t).toEqual({
      kind: "timed",
      startDate: "2026-05-01",
      startTime: "21:06",
      endDate: "2026-05-01",
      endTime: "23:06",
    });
  });

  it("開始が遡って前日にまたぐ", () => {
    const t = deriveReceiptEventTiming("夕食", "2026-05-01", "00:30");
    expect(t.startDate).toBe("2026-04-30");
    expect(t.startTime).toBe("22:30");
    expect(t.endDate).toBe("2026-05-01");
    expect(t.endTime).toBe("00:30");
  });

  it("見出しが表に無ければその他扱い（1時間）", () => {
    const t = deriveReceiptEventTiming("何か", "2026-05-01", "10:00");
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
    const t = deriveReceiptEventTiming("夕食", "2026-05-01", null);
    expect(t).toEqual({
      kind: "timed",
      startDate: "2026-05-01",
      startTime: null,
      endDate: null,
      endTime: null,
    });
  });
});
