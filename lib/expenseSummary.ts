// 「自分がこの旅行で使った金額」サマリ計算
// shared 費用の按分後の自己負担額 + private 費用の合計

import type { Currency, ExchangeRates } from "./currency";
import { convertToDefault } from "./currency";

export type SummaryExpense = {
  visibility: "shared" | "private";
  amount: number;
  currency: Currency;
  payerMemberId: string;
  splittable: boolean;
  splitMemberIds: string[]; // splittable=true のときに使用
  createdByMemberId: string;
};

export type ExpenseSummary = {
  sharedSelfShare: number; // shared 費用での自己負担額（割り勘按分後）
  privateTotal: number; // private 費用の合計
  total: number;
};

export function calculateExpenseSummary(
  expenses: SummaryExpense[],
  myMemberId: string,
  rates: ExchangeRates,
): ExpenseSummary {
  let sharedSelfShare = 0;
  let privateTotal = 0;

  for (const e of expenses) {
    const amount = convertToDefault(e.amount, e.currency, rates);

    if (e.visibility === "private") {
      // 投稿者自身にしか見えない仕様。RLS で守られているはずだが念のため。
      if (e.createdByMemberId === myMemberId) {
        privateTotal += amount;
      }
      continue;
    }

    // shared
    if (e.splittable) {
      if (e.splitMemberIds.includes(myMemberId) && e.splitMemberIds.length > 0) {
        sharedSelfShare += amount / e.splitMemberIds.length;
      }
    } else {
      // 誰かのおごり：自分が支払者なら全額、それ以外は 0
      if (e.payerMemberId === myMemberId) {
        sharedSelfShare += amount;
      }
    }
  }

  return {
    sharedSelfShare,
    privateTotal,
    total: sharedSelfShare + privateTotal,
  };
}
