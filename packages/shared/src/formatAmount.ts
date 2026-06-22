import type { Currency } from "./types/database";

// 金額の表示整形。`Intl.NumberFormat("ja-JP", { style: "currency" })` で
// JPY は小数なし・USD は2桁（ui-guidelines「定型部品」）。手書き整形はしない。
// expense-list / expense-summary など複数の表示で共用する単一の真実。
export function formatAmount(amount: number, currency: Currency): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(amount);
}
