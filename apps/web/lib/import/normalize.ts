import type { EventDraft, Receipt } from "@triplot/shared/import/schema";

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

// 文字の表示幅（全角=1・半角=0.5。プロンプトが LLM に指示する数え方と同じ）。
function charWidth(ch: string): number {
  return /[\x00-\xff]/.test(ch) ? 0.5 : 1;
}

// **保険としての最終切り詰め。** items（費用のメモ）の28字（全角換算）以内は
// プロンプトで LLM に要約させている（品目を「ビール」等に抽象化する判断は
// 中身の意味が要るので LLM の仕事＝ここでは代替できない）。ただし実測で
// 43件中3件（7%）が上限を超えていた — 原因は文字数の数え違いではなく
// 「まとめるべき場面でまとめ切れなかった」こと。LLM の要約判断を上書きは
// せず、それでも超えていた時だけ安全な位置で切ってカードの1行に収める。
const ITEMS_MAX_WIDTH = 28;

export function truncateToWidth(s: string, maxWidth: number): string {
  let width = 0;
  let cut = s.length;
  for (let i = 0; i < s.length; i++) {
    width += charWidth(s[i]);
    if (width > maxWidth) {
      cut = i;
      break;
    }
  }
  if (cut === s.length) return s;
  // 単語の切れ目（カンマ・スペース）まで戻れるなら戻る（"Mushroom Frie…" の
  // ような単語の途中切りを避ける）。戻り幅は英単語1つぶん程度（15文字）を
  // 上限にする — それより遠いと逆に短くなりすぎる。
  const tail = s.slice(0, cut);
  const lastBreak = Math.max(tail.lastIndexOf(", "), tail.lastIndexOf(" "));
  const end = lastBreak >= cut - 15 ? lastBreak : cut;
  return s.slice(0, end).trimEnd() + "…";
}

// Receipt の自由テキスト欄（店名・住所・取引番号）を半角正規化する。
// 通貨/日付/時刻/カテゴリは ISO・整形済み・日本語なので触らない。
export function normalizeReceipt(r: Receipt): Receipt {
  return {
    ...r,
    merchant: toHalfWidth(r.merchant),
    location: r.location != null ? toHalfWidth(r.location) : r.location,
    address: r.address != null ? toHalfWidth(r.address) : r.address,
    referenceId:
      r.referenceId != null ? toHalfWidth(r.referenceId) : r.referenceId,
    items:
      r.items != null ? truncateToWidth(r.items, ITEMS_MAX_WIDTH) : r.items,
  };
}

// EventDraft の自由テキスト欄（見出し・場所・予約番号）を半角正規化する。
// 日付/時刻/TZ は ISO・IANA 名なので触らない。
export function normalizeEventDraft(d: EventDraft): EventDraft {
  return {
    ...d,
    title: toHalfWidth(d.title),
    location: d.location != null ? toHalfWidth(d.location) : d.location,
    address: d.address != null ? toHalfWidth(d.address) : d.address,
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
