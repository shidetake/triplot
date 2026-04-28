// 割り勘の最小トランザクション計算（Splitwise 風 greedy）
// 入力の amount は呼び出し側で default_currency に換算済みであること。

export type SettlementMember = {
  id: string;
};

export type SettlementExpense = {
  id: string;
  amount: number; // default_currency 換算済み
  payerMemberId: string;
  splitMemberIds: string[]; // 空 or splittable=false の費用は呼び出し側で除外する
};

export type Settlement = {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
};

const EPSILON = 0.01;

export function calculateSettlements(
  expenses: SettlementExpense[],
  members: SettlementMember[],
): Settlement[] {
  // 各メンバーのネットバランス（正=受け取る側、負=払う側）
  const balance = new Map<string, number>();
  for (const m of members) balance.set(m.id, 0);

  for (const e of expenses) {
    if (e.splitMemberIds.length === 0) continue;
    const share = e.amount / e.splitMemberIds.length;
    balance.set(
      e.payerMemberId,
      (balance.get(e.payerMemberId) ?? 0) + e.amount,
    );
    for (const memberId of e.splitMemberIds) {
      balance.set(memberId, (balance.get(memberId) ?? 0) - share);
    }
  }

  // 借り手・貸し手キュー
  const creditors: Array<{ id: string; amount: number }> = [];
  const debtors: Array<{ id: string; amount: number }> = [];
  for (const [id, b] of balance) {
    if (b > EPSILON) creditors.push({ id, amount: b });
    else if (b < -EPSILON) debtors.push({ id, amount: -b });
  }
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  // greedy マッチ
  const result: Settlement[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci];
    const d = debtors[di];
    const transfer = Math.min(c.amount, d.amount);
    result.push({
      fromMemberId: d.id,
      toMemberId: c.id,
      amount: transfer,
    });
    c.amount -= transfer;
    d.amount -= transfer;
    if (c.amount < EPSILON) ci++;
    if (d.amount < EPSILON) di++;
  }
  return result;
}
