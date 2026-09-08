import { rateTo, type FxRates } from "../fxRates";

// 費用を作る時の為替レートの初期値。**web・RN のフォームと、フォームを介さない
// 自動確定の3か所で同じ順序を使う**（以前はフォーム側が実績の平均しか見て
// おらず、取り込んだ1件目のレートが空欄のままだった）。
//
// 順序は「実態に近い順」:
//
// 1. 精算通貨と同じなら 1。
// 2. **同じ旅行の同じ通貨の実績の平均**。ユーザーの実効レート（カード手数料
//    込み）なので、市場レートより実態に近い。
// 3. **取り込み時に取っておいた市場レート**（fxRates.ts）。実績がまだ無い
//    ——つまりその通貨の1件目——の時だけ効く。取り込みでない手入力の費用には
//    無いので、その時は空欄のままユーザーに入れてもらう。
//
// 2 が 3 より先なのは、実績ができたら市場レートから乗り換えたいため。
//
// **どこから来た値かも返す。** フォームは値の下に出どころを出すので、ここで
// 決めた順序と食い違わないようにする（分岐を画面側にもう一度書くと、片方だけ
// 直して食い違う——実際このバグがそれだった）。
export type RateSource = "same" | "average" | "market";

export function initialRate(args: {
  // 入力中の通貨。
  currency: string;
  defaultCurrency: string;
  // 同旅行の同通貨の実績の平均（deriveAverageRates）。
  averageRates: Partial<Record<string, number>>;
  // 取り込みから作る時の下書き（手入力なら渡さない）。
  draft?: { initialCurrency: string; fxRates?: FxRates | null } | null;
}): { rate: number; source: RateSource } | null {
  if (args.currency === args.defaultCurrency) return { rate: 1, source: "same" };
  const avg = args.averageRates[args.currency];
  if (avg !== undefined) return { rate: avg, source: "average" };
  // 市場レートは下書きの通貨に対して取ってあるので、通貨を変えたら使えない。
  if (args.draft && args.draft.initialCurrency === args.currency) {
    const market = rateTo(args.draft.fxRates, args.defaultCurrency);
    if (market !== null) return { rate: market, source: "market" };
  }
  return null;
}
