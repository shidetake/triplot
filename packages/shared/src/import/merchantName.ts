// 店名の表記ゆれをならす。
//
// カード・銀行の利用通知に出る店名は、決済代行の接頭辞が付く（Square なら
// "SQ *HOWZIT BREWING"、Toast なら "TST* HANA KOA BREWING"）。同じ店なのに
// 店自身のレシートは "Howzit Brewing" で来るので、そのままでは同じ店だと
// 分からない。
//
// **接頭辞を落とすのは「落とした方が良い」からではない。** 実測では、地理
// バイアスがある状態の Google 検索には接頭辞が付いていても影響が無く、むしろ
// 落とすと悪化する例があった（"SSA - HANAUMA BAY" を削ると施設ではなく地形の
// ハナウマ湾が返る）。落とすのは**そのままでは解決できなかった時の再挑戦**と、
// **文字列どうしを比べる時**だけ。
const PAYMENT_PREFIXES = [
  /^SQ\s*\*/i, // Square
  /^TST\s*\*/i, // Toast
  /^SP\s+/i, // Shopify / Shop Pay
  /^PAYPAL\s*\*/i,
  /^FH\s*\*/i, // FareHarbor
  /^POS\s+/i,
];

// 決済代行の接頭辞を落とす。付いていなければそのまま返す。
export function stripPaymentPrefix(name: string): string {
  let s = name.trim();
  for (const re of PAYMENT_PREFIXES) {
    const next = s.replace(re, "").trim();
    if (next !== s) return next;
  }
  return s;
}

// 文字列として「同じ店か」を比べるための正規化。接頭辞を落とし、小文字化し、
// 記号と連続する空白をならす。
//
// **完全一致でしか使わない。** 部分一致にすると "ABC #78 HAWAII" と
// "ABC #31 HAWAII"（別の店舗）が同じになる。逆に途中で切れた表記
// （"NALU HEALTH BAR AT WAI" と "…AT WAIKIKI"）は一致しないが、
// 取りこぼす方に倒す（間違ってまとめると元に戻せない）。
export function normalizeMerchant(name: string): string {
  return stripPaymentPrefix(name)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
