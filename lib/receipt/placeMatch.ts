// 抽出した merchant/location を、その旅行に登録済みの place に結びつける純関数。
// 方針（ユーザ強い要望）: ちょっとした表記揺れで既存の確定場所を取りこぼさない。
// 名前だけに頼らず、正規化＋トークン類似に加えて住所シグナルも使う。
// 最終確定はレビューUI（ここは「最有力候補＋スコア」を返すだけ）。

export type TripPlace = {
  id: string;
  name: string;
  formattedAddress: string | null;
};

// 店名/法人格/店舗番号などのノイズ語。比較から除く。
const NOISE_TOKENS = new Set([
  "llc",
  "inc",
  "co",
  "ltd",
  "corp",
  "the",
  "kk",
  "株式会社",
  "有限会社",
]);

// 文字列 → 正規化トークン列（小文字・記号/店舗番号除去・ノイズ語除去）。
export function nameTokens(s: string): string[] {
  return s
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

// 1 つの place に対するスコア（0〜1.4 程度）。
function scorePlace(
  receipt: { merchant: string; location: string | null },
  place: TripPlace,
): number {
  const rTok = nameTokens(receipt.merchant);
  const pTok = nameTokens(place.name);
  const rNorm = rTok.join(" ");
  const pNorm = pTok.join(" ");

  let score: number;
  if (rNorm.length > 0 && rNorm === pNorm) {
    score = 1; // 正規化後に一致
  } else {
    score = jaccard(rTok, pTok);
    // 片方がもう片方を含む（"Kai Coffee" ⊂ "Kai Coffee Alohilani - K"）
    if (
      rNorm.length > 0 &&
      pNorm.length > 0 &&
      (rNorm.includes(pNorm) || pNorm.includes(rNorm))
    ) {
      score = Math.max(score, 0.7);
    }
  }

  // 住所シグナル（番地・通り名の共有を加点）。名前より堅い手がかり。
  if (receipt.location && place.formattedAddress) {
    score += jaccard(nameTokens(receipt.location), nameTokens(place.formattedAddress)) * 0.4;
  }
  return score;
}

export type PlaceMatch = { placeId: string; score: number };

// 既存 place 群から最有力候補を返す（閾値未満は null=新規/手動）。
export function matchPlace(
  receipt: { merchant: string; location: string | null },
  places: TripPlace[],
  threshold = 0.5,
): PlaceMatch | null {
  let best: PlaceMatch | null = null;
  for (const p of places) {
    const score = scorePlace(receipt, p);
    if (!best || score > best.score) best = { placeId: p.id, score };
  }
  return best && best.score >= threshold ? best : null;
}
