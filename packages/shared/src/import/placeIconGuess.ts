// レシート/仮予定から Google 解決した場所に、地図ピンの種別（lib/placeIcons.ts
// の ICON_CATALOG key）をベストエフォートで割り当てる。取り込みは推測なので
// 多少の誤りは許容する（確定前の場所ピッカーでユーザーが直せる）。

const GROCERY_KEYWORDS = [
  "スーパー",
  "supermarket",
  "grocery",
  "foodland",
  "safeway",
  "trader joe",
  "whole foods",
  "marché",
];
const BAR_KEYWORDS = [
  "バー",
  "bar",
  "pub",
  "居酒屋",
  "tavern",
  "izakaya",
  "brewery",
  "brewpub",
];
const CAFE_KEYWORDS = ["カフェ", "cafe", "coffee", "喫茶"];

function textHints(text: string | null, keywords: string[]): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

export function guessImportPlaceIcon(input: {
  // 費用のカテゴリ（RECEIPT_CATEGORIES の値）。イベント側の呼び出しでは null。
  category: string | null;
  // 仮予定の title。レシート由来なら朝食/昼食/夕食/カフェ/バー/買い物/観光の
  // いずれか（プロンプト参照）。費用側の呼び出しでは null。
  eventTitle: string | null;
  // 店名・住所などのキーワード手がかり（receipt.merchant や event.location）。
  merchant: string | null;
}): string | null {
  const { category, eventTitle, merchant } = input;

  if (eventTitle === "カフェ") return "cafe";
  if (eventTitle === "バー") return "bar";
  if (eventTitle === "朝食" || eventTitle === "昼食" || eventTitle === "夕食") {
    return "food";
  }
  if (eventTitle === "買い物") {
    return textHints(merchant, GROCERY_KEYWORDS) ? "local_grocery_store" : "shopping";
  }
  if (eventTitle === "観光") return "sightseeing";

  switch (category) {
    case "飲食":
      if (textHints(merchant, BAR_KEYWORDS)) return "bar";
      if (textHints(merchant, CAFE_KEYWORDS)) return "cafe";
      return "food";
    case "土産":
    case "衣服":
      return textHints(merchant, GROCERY_KEYWORDS) ? "local_grocery_store" : "shopping";
    case "エンタメ":
      return "activity";
    case "カジノ":
      return "casino";
    case "宿泊":
      return "lodging";
    case "医療":
      return "local_hospital";
    default:
      return null;
  }
}
