// 費用の合計。2つ出す:
//
// - **個人合計** … 自分がこの旅行で使った額。共有費用の按分後の自己負担に、
//   自分のプライベート費用を足したもの。見る人によって違う。
// - **旅行合計** … 旅行で使った額。共有費用だけを足す。**プライベート費用は
//   自分のものも含めない**ので、どのメンバーが見ても同じ額になる（含めると
//   人によって旅行の総額が違うことになり、旅行の数字として使えない）。
//
// amount は呼び出し側で default_currency に換算済み（local_price × rate_to_default）。

export type SummaryExpense = {
  visibility: "shared" | "private";
  amountInDefault: number; // default_currency 換算済み
  payerMemberId: string;
  splittable: boolean;
  splitMemberIds: string[]; // splittable=true のときに使用
  createdByMemberId: string;
};

export type ExpenseSummary = {
  personalTotal: number; // 自分の負担（プライベート込み）
  tripTotal: number; // 共有費用の合計（全メンバー共通）
};

export function calculateExpenseSummary(
  expenses: SummaryExpense[],
  myMemberId: string,
): ExpenseSummary {
  let personalTotal = 0;
  let tripTotal = 0;

  for (const e of expenses) {
    if (e.visibility === "private") {
      // プライベートは投稿者にしか見えない仕様（RLS で守られているはずだが
      // 念のため）。旅行合計には入れない。
      if (e.createdByMemberId === myMemberId) {
        personalTotal += e.amountInDefault;
      }
      continue;
    }

    // shared
    tripTotal += e.amountInDefault;

    if (e.splittable) {
      if (e.splitMemberIds.includes(myMemberId) && e.splitMemberIds.length > 0) {
        personalTotal += e.amountInDefault / e.splitMemberIds.length;
      }
    } else {
      // 誰かのおごり：自分が支払者なら全額、それ以外は 0
      if (e.payerMemberId === myMemberId) {
        personalTotal += e.amountInDefault;
      }
    }
  }

  return { personalTotal, tripTotal };
}
