export type Currency = "JPY" | "USD";

// trip 内の手動為替レート。currency → default_currency への係数。
// 例: default_currency=JPY, USD=150 → 1 USD = 150 JPY
export type ExchangeRates = Partial<Record<Currency, number>>;

export function convertToDefault(
  amount: number,
  currency: Currency,
  rates: ExchangeRates,
): number {
  const rate = rates[currency] ?? 1;
  return amount * rate;
}
