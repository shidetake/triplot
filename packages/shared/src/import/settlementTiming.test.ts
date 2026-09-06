import { describe, expect, it } from "vitest";

import { localizeSettlementTiming } from "./settlementTiming";

// 実データ: ソニー銀行の通知（日本時間の暦で「カード利用日：2026年4月29日」）が
// ハワイでの支払いを指している。送信は 2026-04-29T02:38:23Z ＝ 日本 4/29 11:38 ＝
// ホノルル 4/28 16:38。
const sony = {
  date: "2026-04-29",
  time: null,
  dateIsSettlement: true,
  settlementTz: "Asia/Tokyo",
};
const HNL = "Pacific/Honolulu";

describe("localizeSettlementTiming", () => {
  it("日付しか無い通知は、送信時刻を現地の壁時計に直して日付と時刻を得る", () => {
    expect(
      localizeSettlementTiming(sony, {
        sentAt: "2026-04-29T02:38:23.000Z",
        placeTz: HNL,
      }),
    ).toEqual({ date: "2026-04-28", time: "16:38" });
  });

  it("本文に日時があればそれを発行元の暦で読んで直す（送信時刻は要らない）", () => {
    expect(
      localizeSettlementTiming(
        { ...sony, time: "11:38" },
        { sentAt: null, placeTz: HNL },
      ),
    ).toEqual({ date: "2026-04-28", time: "16:38" });
  });

  // 後日まとめて届く「ご利用金額確定のお知らせ」や、何か月も経ってからの転送。
  it("送信日が発行元の暦で利用日と違うなら送信時刻を捨てる", () => {
    expect(
      localizeSettlementTiming(sony, {
        sentAt: "2026-09-06T05:25:31.000Z",
        placeTz: HNL,
      }),
    ).toBeNull();
  });

  it("店のレシートには触らない", () => {
    expect(
      localizeSettlementTiming(
        { ...sony, dateIsSettlement: false },
        { sentAt: "2026-04-29T02:38:23.000Z", placeTz: HNL },
      ),
    ).toBeNull();
  });

  it("発行元の暦が分からなければ直さない", () => {
    expect(
      localizeSettlementTiming(
        { ...sony, settlementTz: null },
        { sentAt: "2026-04-29T02:38:23.000Z", placeTz: HNL },
      ),
    ).toBeNull();
  });

  it("買った場所が分からなければ直さない", () => {
    expect(
      localizeSettlementTiming(sony, {
        sentAt: "2026-04-29T02:38:23.000Z",
        placeTz: null,
      }),
    ).toBeNull();
  });

  it("送信時刻が無く、本文も日付だけなら直さない", () => {
    expect(
      localizeSettlementTiming(sony, { sentAt: null, placeTz: HNL }),
    ).toBeNull();
  });

  // 国内利用（発行元と同じ暦）。日付は変わらないが、時刻の無い通知に
  // 送信時刻から時刻が付く＝仮予定が終日でなく時間付きになる。
  it("発行元と同じ土地なら日付は動かず時刻だけ付く", () => {
    expect(
      localizeSettlementTiming(sony, {
        sentAt: "2026-04-29T02:38:23.000Z",
        placeTz: "Asia/Tokyo",
      }),
    ).toEqual({ date: "2026-04-29", time: "11:38" });
  });
});
