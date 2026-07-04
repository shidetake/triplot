import type { EventDraft, Receipt } from "./schema";

// 全角 ASCII（Ａ-Ｚ ０-９ ＊ 等 = U+FF01〜U+FF5E）を半角へ、全角スペース(U+3000)を
// 半角スペースへ。連続スペースは1つに詰める。日本語・カタカナ(U+30xx)は触らない
// （半角化しない）。レシートの店名に銀行由来の「ＵＢＥＲ　＊ＴＲＩＰ」等が混じるので
// 取り込み時に正規化する。
export function toHalfWidth(s: string): string {
  return s
    .replace(/[！-～]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/　/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

// Receipt の自由テキスト欄（店名・住所・取引番号）を半角正規化する。
// 通貨/日付/時刻/カテゴリは ISO・整形済み・日本語なので触らない。
export function normalizeReceipt(r: Receipt): Receipt {
  return {
    ...r,
    merchant: toHalfWidth(r.merchant),
    location: r.location != null ? toHalfWidth(r.location) : r.location,
    referenceId:
      r.referenceId != null ? toHalfWidth(r.referenceId) : r.referenceId,
  };
}

// EventDraft の自由テキスト欄（見出し・場所・予約番号）を半角正規化する。
// 日付/時刻/TZ は ISO・IANA 名なので触らない。
export function normalizeEventDraft(d: EventDraft): EventDraft {
  return {
    ...d,
    title: toHalfWidth(d.title),
    location: d.location != null ? toHalfWidth(d.location) : d.location,
    referenceId:
      d.referenceId != null ? toHalfWidth(d.referenceId) : d.referenceId,
    vehicleNumber:
      d.vehicleNumber != null ? toHalfWidth(d.vehicleNumber) : d.vehicleNumber,
    departTerminal:
      d.departTerminal != null
        ? toHalfWidth(d.departTerminal)
        : d.departTerminal,
    arriveTerminal:
      d.arriveTerminal != null
        ? toHalfWidth(d.arriveTerminal)
        : d.arriveTerminal,
    departLocation:
      d.departLocation != null
        ? toHalfWidth(d.departLocation)
        : d.departLocation,
    arriveLocation:
      d.arriveLocation != null
        ? toHalfWidth(d.arriveLocation)
        : d.arriveLocation,
  };
}
