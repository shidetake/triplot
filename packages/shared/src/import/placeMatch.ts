// 抽出した merchant/location を、その旅行に登録済みの place に結びつける純関数。
// 方針（ユーザ強い要望）: ちょっとした表記揺れで既存の確定場所を取りこぼさない。
// 名前だけに頼らず、正規化＋トークン類似に加えて住所シグナルも使う。
// 最終確定はレビューUI（ここは「最有力候補＋スコア」を返すだけ）。

import { stripPaymentPrefix } from "./merchantName";

export type TripPlace = {
  id: string;
  name: string;
  formattedAddress: string | null;
};

// 店名/法人格/店舗番号などのノイズ語＋繋ぎ語（"Coffee at Moana" の at 等）。比較から除く。
const NOISE_TOKENS = new Set([
  "llc",
  "inc",
  "co",
  "ltd",
  "corp",
  "the",
  "at",
  "of",
  "and",
  "by",
  "kk",
  "株式会社",
  "有限会社",
]);

// 文字列 → 正規化トークン列（小文字・記号/店舗番号除去・ノイズ語除去）。
export function nameTokens(s: string): string[] {
  // 決済代行の接頭辞（"SQ *", "FH* " 等）は店名ではないので、比較に混ぜない。
  // 混ざると "sq" が1トークンぶんの重みを持ち、一致度が薄まる。
  return stripPaymentPrefix(s)
    .toLowerCase()
    .replace(/#\s*\d+/g, " ") // 店舗番号 #1234
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // 記号→空白（多言語）
    .split(/\s+/)
    .filter((t) => t.length > 0 && !NOISE_TOKENS.has(t));
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / (A.size + B.size - inter);
}

// a の語が b に全部含まれるか。
function contains(a: string[], b: string[]): boolean {
  const B = new Set(b);
  return a.every((t) => B.has(t));
}

// 名前だけのスコア（0〜1）。**同じ店かどうかはここで決まる。**
function scoreName(merchant: string, place: TripPlace): number {
  const rTok = nameTokens(merchant);
  const pTok = nameTokens(place.name);
  const rNorm = rTok.join(" ");
  const pNorm = pTok.join(" ");

  if (rNorm.length > 0 && rNorm === pNorm) return 1; // 正規化後に一致
  let score = jaccard(rTok, pTok);
  // 片方の語がもう片方に全部含まれる（"Kai Coffee" ⊂ "Kai Coffee Alohilani - K"）。
  //
  // **語の単位で見る。** 文字列の部分一致にすると、短い名前が別の語の内側に
  // 紛れ込む（実データ: "ALO" が "kai coffee alohilani k" の "alo" に一致して、
  // Kai Coffee のレシートが ALO の場所に吸い寄せられた。同じ旅行には
  // "Aloha Tower" もある）。
  if (rTok.length > 0 && pTok.length > 0 && (contains(rTok, pTok) || contains(pTok, rTok))) {
    score = Math.max(score, 0.7);
  }
  return score;
}

// 住所の一致による加点（0〜0.4）。**順位付けにだけ使う。**
//
// 住所が言えるのは「同じ建物か」までで、どの店かは言えない。モールやビルなら
// 全店が同じ番地を持つ。実際、ALO Ala Moana と UNIQLO Ala Moana は同じ
// 1450 Ala Moana Blvd で、名前の一致が 0.33 しか無いのに住所の加点で閾値
// ちょうど 0.50 に乗り、**ALO のレシートが UNIQLO の場所に紐づいた**
// （同じメールから出た費用は ALO に付いたので、片方だけずれて気付きにくい）。
//
// なので住所は**資格を与えない**（matchPlace 参照）。名前で候補に残ったものの
// 中で、どれが一番近いかを決めるのにだけ使う。
function addressBonus(
  address: string | null,
  place: TripPlace,
): number {
  if (!address || !place.formattedAddress) return 0;
  return jaccard(nameTokens(address), nameTokens(place.formattedAddress)) * 0.4;
}

export type PlaceMatch = { placeId: string; score: number };

// 既存 place 群から最有力候補を返す（閾値未満は null=新規/手動）。
// name は**場所の名前**（receiptPlaceName で決まる）。merchant とは限らない
// ＝予約サイト経由の予約ではホテル名が来る。
export function matchPlace(
  target: { name: string; address: string | null },
  places: TripPlace[],
  threshold = 0.5,
): PlaceMatch | null {
  let best: PlaceMatch | null = null;
  for (const p of places) {
    // **候補に残る資格は名前だけで決める。** 住所で資格を与えると、同じビルの
    // 別の店に吸い寄せられる（addressBonus のコメント参照）。
    const nameScore = scoreName(target.name, p);
    if (nameScore < threshold) continue;
    const score = nameScore + addressBonus(target.address, p);
    if (!best || score > best.score) best = { placeId: p.id, score };
  }
  return best;
}
