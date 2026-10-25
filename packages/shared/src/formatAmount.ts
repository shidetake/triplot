import type { Currency } from "./types/database";

// 通貨ごとの小数の桁。JPY は小数なし・それ以外は2桁（表示と丸めの両方で使う）。
function fractionDigits(currency: Currency): number {
  return currency === "JPY" ? 0 : 2;
}

// 金額の表示整形。`Intl.NumberFormat("ja-JP", { style: "currency" })` で
// JPY は小数なし・USD は2桁（ui-guidelines「定型部品」）。手書き整形はしない。
// expense-list / expense-summary など複数の表示で共用する単一の真実。
//
// 取り込みの下書きの通貨は LLM が読んだ文字列なので、ISO 4217 に無い値が来る
// こともある（Intl が例外を投げる）。その時だけ数値と通貨をそのまま並べる。
export function formatAmount(amount: number, currency: Currency): string {
  try {
    return new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency,
      maximumFractionDigits: fractionDigits(currency),
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

// 計算した金額を通貨の最小単位（USD なら 0.01）に丸める。小数の足し算は
// 2進数の誤差を残す（3.62 + 0.52 = 4.140000000000001）ので、足した結果を
// 保存する前に通す。
export function roundAmount(amount: number, currency: Currency): number {
  const unit = 10 ** fractionDigits(currency);
  return Math.round(amount * unit) / unit;
}
