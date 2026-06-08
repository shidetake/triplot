import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

import { normalizeReceipt } from "./normalize";
import { buildReceiptPrompt, RECEIPT_SYSTEM_PROMPT, type TripHint } from "./prompt";
import { type Receipt, receiptSchema } from "./schema";

export type { TripHint } from "./prompt";

// 抽出と「どの旅行か」の割り当てを 1 回の generateObject で同時に行う。別呼び出しに
// しないことで追加トークンは候補旅行リスト分だけに収まり、本文＋旅行を一緒に見るので
// 日付の取り違え（黙って別の旅行に割り当てる）も減る。
const extractionSchema = z.object({
  receipt: receiptSchema,
  tripId: z
    .string()
    .nullable()
    .describe("このレシートが属する旅行の id（候補から選ぶ）。確信が無ければ null"),
  detailUrl: z
    .string()
    .nullable()
    .describe(
      "本文がスカスカで、品目・小計などより詳しいレシート/明細が別 URL 先にある場合のみ、その URL（例: 『View your receipt』『領収書を見る』のリンク先）。本文に十分な明細があれば、または該当リンクが無ければ null。本文に実在する URL のみ",
    ),
});

// レシート本文 → 構造化データ（LLM 抽出）＋ 旅行割り当て。プロバイダ非依存：model は
// 呼び出し側で用意して渡す（BYOK ではユーザのキーで作ったモデルインスタンス）。
// trips を渡すと tripId を推論する（渡さなければ tripId は常に null）。
export async function extractReceipt(
  model: LanguageModel,
  input: { subject: string; text: string; trips?: TripHint[] },
): Promise<{ receipt: Receipt; tripId: string | null; detailUrl: string | null }> {
  const trips = input.trips ?? [];
  const { object } = await generateObject({
    model,
    schema: extractionSchema,
    system: RECEIPT_SYSTEM_PROMPT,
    prompt: buildReceiptPrompt(input),
  });
  // 幻覚 id を弾く（候補に無い id は無効として未割当に）。
  const tripId = trips.some((t) => t.id === object.tripId) ? object.tripId : null;
  // 幻覚 URL を弾く（本文に実在する URL のみ採用）。
  const detailUrl =
    object.detailUrl && input.text.includes(object.detailUrl)
      ? object.detailUrl
      : null;
  // 店名等の全角ASCIIを半角に正規化（日本語・カタカナは保持）。
  return { receipt: normalizeReceipt(object.receipt), tripId, detailUrl };
}
