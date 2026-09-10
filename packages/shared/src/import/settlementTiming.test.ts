import { describe, expect, it } from "vitest";

import {
  localizeSettlementByTrip,
  localizeSettlementTiming,
} from "./settlementTiming";

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

// 旅程を土地の代わりにする経路（店の場所が Google で引けなかった時の控え）。
// 実データ: "WHOLEFDS QUE#10615" はカードの明細表記で場所が解決できず、
// ホノルルでの買い物が日本時間の翌日（4/29）に置かれていた。
describe("localizeSettlementByTrip", () => {
  // 成田 4/28 19:10 発 → ホノルル 4/28 07:25 着（同じ暦日に着く）。
  const timeline = {
    fallbackTz: "Asia/Tokyo",
    transits: [
      {
        transitId: "t1",
        departDate: "2026-04-27",
        departTime: "19:10",
        departTz: "Asia/Tokyo",
        arriveDate: "2026-04-28",
        arriveTime: "07:25",
        arriveTz: HNL,
      },
      {
        transitId: "t2",
        departDate: "2026-05-05",
        departTime: "13:30",
        departTz: HNL,
        arriveDate: "2026-05-06",
        arriveTime: "17:40",
        arriveTz: "Asia/Tokyo",
      },
    ],
  };
  // 送信 2026-04-29T01:42:13Z ＝ 日本 4/29 10:42 ＝ ホノルル 4/28 15:42。
  const wholefds = { ...sony, sentAt: "2026-04-29T01:42:13.000Z" };

  it("場所が分からなくても、その瞬間に居た土地の壁時計に直す", () => {
    expect(localizeSettlementByTrip(wholefds, timeline)).toEqual({
      date: "2026-04-28",
      time: "15:42",
      // どのタイムゾーンで読んだかも返す（受け取った側が当て直さないように）。
      tz: HNL,
    });
  });

  // 4/28 は到着日＝日付だけでは出発側か到着側か決まらないが、瞬間で見れば
  // 到着（07:25）より後なので一意に決まる。着陸の35分後の支払い。
  it("移動日でも、到着より後の瞬間は到着側になる", () => {
    expect(
      localizeSettlementByTrip(
        { ...wholefds, date: "2026-04-29", sentAt: "2026-04-28T18:00:00.000Z" },
        timeline,
      ),
    ).toEqual({ date: "2026-04-28", time: "08:00", tz: HNL });
  });

  it("移動が1本も無い旅程では直さない（居場所の根拠が無い）", () => {
    expect(
      localizeSettlementByTrip(wholefds, {
        fallbackTz: "Asia/Tokyo",
        transits: [],
      }),
    ).toBeNull();
  });

  it("飛行機の中の瞬間は直さない（どちらの土地でもない）", () => {
    // 離陸（4/27 10:10Z）と着陸（4/28 17:25Z）の間。日本の暦では 4/27 22:00
    // なので利用日も 4/27＝即時性の判定は通り、機内であることだけで落ちる。
    expect(
      localizeSettlementByTrip(
        { ...sony, date: "2026-04-27", sentAt: "2026-04-27T13:00:00.000Z" },
        timeline,
      ),
    ).toBeNull();
  });

  // 店のレシート（dateIsSettlement=false）は最初から現地の壁時計なので触らない。
  it("店のレシートには触らない", () => {
    expect(
      localizeSettlementByTrip(
        { ...wholefds, dateIsSettlement: false },
        timeline,
      ),
    ).toBeNull();
  });

  // 即時性の判定は本体と共通。後日届く「ご利用金額確定のお知らせ」はここで落ちる。
  it("送信日が発行元の暦で利用日と違うなら直さない", () => {
    expect(
      localizeSettlementByTrip(
        { ...sony, sentAt: "2026-09-06T05:25:31.000Z" },
        timeline,
      ),
    ).toBeNull();
  });
});
