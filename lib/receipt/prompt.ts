// レシート抽出のプロンプト生成（純関数）。プロバイダ非依存。
// generateObject に system + prompt として渡す前提。スキーマ（receiptSchema）が
// 出力の形を縛るので、ここでは「何を読むべきか」の指示と入力本文だけを作る。

export const RECEIPT_SYSTEM_PROMPT = [
  "あなたは購入レシートのメールから費用情報を抽出するアシスタントです。",
  "メールは利用者が転送したもので、本文に『Forwarded message』として元の販売元",
  "（店舗・サービス）の情報が含まれることがあります。元の販売元を merchant とし、",
  "転送した本人の名前を merchant にしないこと。",
  // total: subtotal ではなく最終の支払総額（前ツールの教訓: Toast は Subtotal の後に Total）
  "total は実際に支払った最終総額（税・チップ・手数料込み）。途中の小計(subtotal)を",
  "拾わないこと。通貨は記号から ISO 4217 に変換する（$→USD、¥→JPY 等）。",
  // date: 利用日であって確定日/請求日/予約日ではない（前ツールの落とし穴）
  "date は実際に利用・購入した日（利用日）を YYYY-MM-DD で。カード確定日・請求日・",
  "予約日ではない。年が無ければ文脈/受信日から補う。",
  // category: 中身で判断。ブランド/会場名に釣られない（例: ホテル内レストランは飲食）
  "category は実際に購入した内容で選ぶ。施設やブランド名に釣られないこと",
  "（例: ホテル内のレストランでの飲食は『宿泊』ではなく『飲食』）。",
  "本文に添付ファイルや明細リンクから抽出したテキストが付加されている場合はそれも参照する。",
  "本文中のトラッキングURL・画像・フッターの定型文は無視する。",
  "読み取れない項目は無理に推測せず、不明は空文字 / null。",
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
