import { describe, expect, it } from "vitest";

import { chooseAuthoritativeDate } from "./receiptDate";
import { localizeSettlementTiming } from "./settlementTiming";

// 実データ（VILLAGE BOTTLE）で起きた取りこぼしの再現。
//
// 利用の通知（5/1 送信・利用日 5/1）を単体で処理した時、店名が途中で切れて
// いて場所が解決できず、タイムゾーンが引けないので現地化できなかった。その後
// 確定の通知（5/2 送信）が合体してきた時に店名が揃って場所は解決したが、その
// 時に手元にある送信時刻は確定の通知のもので、日付（5/1）と噛み合わない。
const 利用 = {
  date: "2026-05-01",
  time: null,
  serviceDate: null,
  dateIsSettlement: true,
  settlementTz: "Asia/Tokyo",
  sentAt: "2026-05-01T02:55:40.000Z",
};
const 確定 = {
  date: "2026-05-02",
  time: null,
  serviceDate: null,
  dateIsSettlement: true,
  settlementTz: "Asia/Tokyo",
  sentAt: "2026-05-02T00:08:22.000Z",
};

describe("場所が後から解決した時の現地化", () => {
  it("日付と一緒に運んだ送信時刻で直せる", () => {
    // 合体後は古い方（利用）の日付が勝ち、送信時刻も一緒に来る。
    const a = chooseAuthoritativeDate(利用, 確定);
    expect(a.date).toBe("2026-05-01");
    expect(a.sentAt).toBe(利用.sentAt);

    expect(
      localizeSettlementTiming(a, {
        sentAt: a.sentAt,
        placeTz: "Pacific/Honolulu",
      }),
    ).toEqual({ date: "2026-04-30", time: "16:55" });
  });

  it("今処理しているメール（確定）の送信時刻では直せない", () => {
    const a = chooseAuthoritativeDate(利用, 確定);
    expect(
      localizeSettlementTiming(a, {
        sentAt: 確定.sentAt,
        placeTz: "Pacific/Honolulu",
      }),
    ).toBeNull();
  });
});
