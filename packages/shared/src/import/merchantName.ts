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
// 決済代行の接頭辞。**リストで数え上げず、形で捕まえる。**
//
// 共通しているのは**アスタリスク**（"SQ *HOWZIT BREWING" / "FH* DIVE OAHU" /
// "UBER *TRIP" / "*TUTU'S TREATS"）。実在の店名にアスタリスクはまず入らないので、
// 「英数字が少しあってアスタリスク」で切れば、提供元を1つずつ知らなくても落ちる。
//
// **アスタリスクの無い接頭辞は落とさない。** "SP " や "POS " のような形は実在の
// 店名の一部でありうるし、削って悪化した実例もある（"SSA - HANAUMA BAY" を
// 削ると施設ではなく地形のハナウマ湾が返る）。危ない方には踏み込まない。
const PAYMENT_PREFIX = /^[A-Z0-9]{0,5}\s*\*\s*/i;

// 決済代行の接頭辞を落とす。付いていなければそのまま返す。
export function stripPaymentPrefix(name: string): string {
  const s = name.trim();
  const stripped = s.replace(PAYMENT_PREFIX, "").trim();
  // 全部消えるなら接頭辞ではない（"*" だけの名前など）。元のまま返す。
  return stripped.length > 0 ? stripped : s;
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

// レシートから「場所の名前」を取る。**location を優先し、無ければ merchant**。
//
// 2つある理由は、両者の意味が違うから。merchant は**誰に請求されたか**で、
// マージの手がかりと受信箱の行の見出しに使う。location は**実際にどこに居たか**で、
// 地図に載せる場所はこちら。普通の店のレシートでは同じ文字列になるが、
// 食い違う場面が2つある。
//
//   銀行・カード会社の通知  merchant は明細の文字列（"SQ *KONA COFFEE PURVEY"）で
//                           場所の名前としては使えないが、取引の突き合わせには要る。
//                           location は書かれていないことが多い（→ merchant に落ちる）
//   予約サイト経由の予約    merchant は Expedia（請求元）、location はホテル。
//                           泊まるのはホテルなので、場所はこちらでないといけない
//
// 以前は場所の解決が merchant だけを見ていて、Expedia で取ったホテルの費用が
// 「Expedia」という場所になっていた（実機で発覚）。
export function receiptPlaceName(r: {
  merchant: string;
  location?: string | null;
}): string {
  return r.location?.trim() || r.merchant;
}
