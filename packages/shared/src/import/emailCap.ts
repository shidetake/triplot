// メール取り込みの月間上限（docs/design/billing.md「実効上限 = プランの上限と
// 個別上書きの大きい方」）。

// 実効上限 = max(プランの上限, 個別上書き)。個別上書きが未設定なら 0 とみなす。
//
// **max にする。** 「個別上書きがあればそちらを優先」にすると、優遇されている
// ユーザが課金したときにプランの上限より優遇値が優先され、支払ったのに枠が
// 増えない。max にしておけば、課金処理はプランだけを触ればよく、優遇の値を
// 退避・復元するロジックが要らない。
export function effectiveEmailCap(
  planCap: number,
  override: number | null | undefined,
): number {
  return Math.max(planCap, override ?? 0);
}
