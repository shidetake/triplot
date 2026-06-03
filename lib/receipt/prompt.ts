// レシート抽出のプロンプト生成（純関数）。プロバイダ非依存。
// generateObject に system + prompt として渡す前提。スキーマ（receiptSchema）が
// 出力の形を縛るので、ここでは「何を読むべきか」の指示と入力本文だけを作る。

export const RECEIPT_SYSTEM_PROMPT = [
  "あなたは購入レシートのメールから費用情報を抽出するアシスタントです。",
  "メールは利用者が転送したもので、本文に『Forwarded message』として元の販売元",
  "（店舗・サービス）の情報が含まれることがあります。元の販売元を merchant とし、",
  "転送した本人の名前を merchant にしないこと。",
  "合計は実際に支払った総額（税・チップ・手数料込み）。通貨は記号から ISO 4217 に",
  "変換する（$→USD、¥→JPY 等）。日付は取引日を YYYY-MM-DD で。本文中のトラッキング",
  "URL や画像は無視する。読み取れない項目は無理に推測せず、不明は空文字 / null。",
].join("");

// 件名＋本文から、抽出対象のユーザメッセージを組み立てる。
export function buildReceiptPrompt(input: {
  subject: string;
  text: string;
}): string {
  const subject = input.subject.trim();
  const text = input.text.trim();
  return [
    "次のレシートメールから費用情報を抽出してください。",
    "",
    `件名: ${subject || "(なし)"}`,
    "",
    "本文:",
    text,
  ].join("\n");
}
