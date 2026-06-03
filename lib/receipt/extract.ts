import { generateObject, type LanguageModel } from "ai";

import { buildReceiptPrompt, RECEIPT_SYSTEM_PROMPT } from "./prompt";
import { type Receipt, receiptSchema } from "./schema";

// レシート本文 → 構造化データ（LLM 抽出）。プロバイダ非依存：model は呼び出し側で
// 用意して渡す（BYOK ではユーザのキーで作ったモデルインスタンスを渡す）。
// generateObject + receiptSchema が出力の形を縛るので、ここはモデルに依存しない。
export async function extractReceipt(
  model: LanguageModel,
  input: { subject: string; text: string },
): Promise<Receipt> {
  const { object } = await generateObject({
    model,
    schema: receiptSchema,
    system: RECEIPT_SYSTEM_PROMPT,
    prompt: buildReceiptPrompt(input),
  });
  return object;
}
