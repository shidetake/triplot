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
  categoryId: string;
  amountInDefault: number; // default_currency 換算済み
  payerMemberId: string;
  splittable: boolean;
  splitMemberIds: string[]; // splittable=true のときに使用
  createdByMemberId: string;
};

// カテゴリ別の内訳。合計と同じ1回の走査で作るので、必ず合計と一致する。
export type CategoryAmount = {
  categoryId: string;
  personal: number;
  trip: number;
};

export type ExpenseSummary = {
  personalTotal: number; // 自分の負担（プライベート込み）
  tripTotal: number; // 共有費用の合計（全メンバー共通）
  // どちらかに金額のあるカテゴリだけ。**旅行合計の降順**で、個人・旅行の
  // どちらの図でも同じ並びにする（並びが揃っていれば2つの図を見比べられる。
  // 図ごとに大きい順へ並べ替えると同じカテゴリが別の位置に出て比べられない）。
  byCategory: CategoryAmount[];
};

export function calculateExpenseSummary(
  expenses: SummaryExpense[],
  myMemberId: string,
): ExpenseSummary {
  let personalTotal = 0;
  let tripTotal = 0;
  const byCategory = new Map<string, CategoryAmount>();
  const bucket = (categoryId: string): CategoryAmount => {
    let b = byCategory.get(categoryId);
    if (!b) {
      b = { categoryId, personal: 0, trip: 0 };
      byCategory.set(categoryId, b);
    }
    return b;
  };

  for (const e of expenses) {
    if (e.visibility === "private") {
      // プライベートは投稿者にしか見えない仕様（RLS で守られているはずだが
      // 念のため）。旅行合計には入れない。
      if (e.createdByMemberId === myMemberId) {
        personalTotal += e.amountInDefault;
        bucket(e.categoryId).personal += e.amountInDefault;
      }
      continue;
    }

    // shared
    tripTotal += e.amountInDefault;
    bucket(e.categoryId).trip += e.amountInDefault;

    let selfShare = 0;
    if (e.splittable) {
      if (e.splitMemberIds.includes(myMemberId) && e.splitMemberIds.length > 0) {
        selfShare = e.amountInDefault / e.splitMemberIds.length;
      }
    } else if (e.payerMemberId === myMemberId) {
      // 誰かのおごり：自分が支払者なら全額、それ以外は 0
      selfShare = e.amountInDefault;
    }
    personalTotal += selfShare;
    bucket(e.categoryId).personal += selfShare;
  }

  return {
    personalTotal,
    tripTotal,
    byCategory: [...byCategory.values()]
      .filter((c) => c.trip > 0 || c.personal > 0)
      // 同額のときに並びが揺れないよう、最後は id で決着させる。
      .sort(
        (a, b) =>
          b.trip - a.trip ||
          b.personal - a.personal ||
          a.categoryId.localeCompare(b.categoryId),
      ),
  };
}
