import { describe, expect, it } from "vitest";

import { receiptMoment } from "./receiptDate";
import { deriveReceiptEventTiming } from "./receiptTiming";

// 仮費用と仮予定は同じレシートから出る。**日時の決め方が1本でなければ、片方
// だけ正解する状態が作れてしまう**（実データ: Diamond Head の入場券が費用
// 5/2 13:00・仮予定 4/18 と別の日に並んだ）。ここは「両方が同じ起点から出て
// いる」ことを固定する。
describe("仮費用と仮予定の起点は必ず一致する", () => {
  // 4/18 に買った入場券。利用日は 5/2 で、同じメールに予約の予定（13:00 開始）
  // がある。購入時刻 17:56 は利用日の時刻ではないので使わない。
  const ticket = { date: "2026-04-18", time: "17:56", serviceDate: "2026-05-02" };
  const reservation = {
    startDate: "2026-05-02",
    startTime: "13:00",
    fromReceipt: false,
  };

  it("使う日が別で、同じメールに予約があるなら、両方がその開始時刻を起点にする", () => {
    const m = receiptMoment(ticket, [reservation]);
    expect(m).toEqual({ date: "2026-05-02", time: "13:00", kind: "start" });

    // 予定は起点から所要時間ぶん**前に**伸ばす（入場時刻から滞在が始まる）。
    const t = deriveReceiptEventTiming("観光", ticket, [reservation]);
    expect(t.startDate).toBe(m.date);
    expect(t.startTime).toBe(m.time);
    expect(t.endTime).toBe("14:00");
  });

  it("借りる相手が無ければ、両方とも時刻を持たない（片方だけ持たない、が起きない）", () => {
    const m = receiptMoment(ticket, []);
    expect(m).toEqual({ date: "2026-05-02", time: null, kind: null });

    const t = deriveReceiptEventTiming("観光", ticket, []);
    expect(t.startDate).toBe(m.date);
    expect(t.startTime).toBeNull();
  });

  // レシート由来の仮予定は支払いの瞬間の写しなので、そこから借りると導いた値を
  // 読み返すことになる（実在しない日時が経路を変えて復活する）。
  it("借りる相手はレシート由来の仮予定を含まない", () => {
    const m = receiptMoment(ticket, [
      { startDate: "2026-05-02", startTime: "09:00", fromReceipt: true },
    ]);
    expect(m.time).toBeNull();
  });

  // その場で買ってその場で使うレシートは支払いの瞬間が起点。予定は会計を終わり
  // として前に遡る（従来どおり）。費用の時刻は会計時刻そのもの。
  it("同じ日に買って使ったなら、支払いの瞬間が両方の起点になる", () => {
    const dinner = { date: "2026-05-01", time: "23:06", serviceDate: null };
    const m = receiptMoment(dinner, []);
    expect(m).toEqual({ date: "2026-05-01", time: "23:06", kind: "payment" });

    const t = deriveReceiptEventTiming("夕食", dinner, []);
    expect(t.startTime).toBe("21:06");
    expect(t.endTime).toBe(m.time);
  });
});
