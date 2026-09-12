import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

import { normalizeEventDraft, normalizeReceipt } from "./normalize";
import { logUsage } from "./usageLog";
import { applyReceiptEventTiming } from "@triplot/shared/import/receiptTiming";
import { buildImportPrompt, IMPORT_SYSTEM_PROMPT, type TripHint } from "./prompt";
import {
  type Extraction,
  eventDraftSchema,
  receiptSchema,
  sanitizeEventDraft,
} from "@triplot/shared/import/schema";

export type { TripHint } from "./prompt";

// 抽出（費用＋予定）と「どの旅行か」の割り当てを 1 回の generateObject で同時に行う。
// 別呼び出しにしないことで追加トークンは候補旅行リスト分だけに収まり、本文＋旅行を
// 一緒に見るので日付の取り違え（黙って別の旅行に割り当てる）も減る。
const extractionSchema = z.object({
  receipt: receiptSchema
    .nullable()
    .describe(
      "このメールの支払い（費用）情報。金額の無いメール（旅程・予約リマインダー等）は null",
    ),
  events: z
    .array(eventDraftSchema)
    .describe(
      "このメールから旅程に載せる予定（フライト・宿泊・予約等）。無ければ空配列",
    ),
  tripId: z
    .string()
    .nullable()
    .describe("このメールが属する旅行の id（候補から選ぶ）。確信が無ければ null"),
  detailUrl: z
    .string()
    .nullable()
    .describe(
      "本文がスカスカで、品目・小計などより詳しいレシート/明細が別 URL 先にある場合のみ、その URL（例: 『View your receipt』『領収書を見る』のリンク先）。本文に十分な明細があれば、または該当リンクが無ければ null。本文に実在する URL のみ",
    ),
});

// メール本文 → 構造化データ（LLM 抽出）＋ 旅行割り当て。プロバイダ非依存：model は
// 呼び出し側で用意して渡す（BYOK ではユーザのキーで作ったモデルインスタンス）。
// trips を渡すと tripId を推論する（渡さなければ tripId は常に null）。
// events は検証・補正（sanitizeEventDraft）済みのものだけ返す。
export async function extractEmail(
  model: LanguageModel,
  input: { subject: string; text: string; trips?: TripHint[] },
): Promise<Extraction & { tripId: string | null; detailUrl: string | null }> {
  const trips = input.trips ?? [];
  const { object, usage } = await generateObject({
    model,
    schema: extractionSchema,
    // **固定の指示を先に、可変の本文を後に置く。** Gemini 2.5 系は先頭が同一の
    // 入力に自動でキャッシュ割引（75%）を効かせるので、並び順がそのまま単価に
    // なる。指示とスキーマ説明で約 7,500 トークンあり、最低要件（1,024）を
    // 大きく超えているので、この並びのままなら毎回効く。プロンプトを書き換えると
    // その時だけ外れる（壊れるのではなく、割引が乗り直すまで1回ぶん高くなる）。
    system: IMPORT_SYSTEM_PROMPT,
    prompt: buildImportPrompt(input),
  });
  logUsage("extract", usage);
  // 幻覚 id を弾く（候補に無い id は無効として未割当に）。
  const tripId = trips.some((t) => t.id === object.tripId) ? object.tripId : null;
  // 幻覚 URL を弾く（本文に実在する URL のみ採用）。
  const detailUrl =
    object.detailUrl && input.text.includes(object.detailUrl)
      ? object.detailUrl
      : null;
  // 店名等の全角ASCIIを半角に正規化（日本語・カタカナは保持）。予定は日付/時刻/TZ の
  // 形式・実在検証も通し、使えない下書きは捨てる。
  const receipt = object.receipt ? normalizeReceipt(object.receipt) : null;
  const events = object.events
    .map(sanitizeEventDraft)
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .map(normalizeEventDraft);
  return {
    receipt,
    // receipt由来の仮予定の時刻は LLM に作らせず、確定した receipt の日時から
    // 機械的に埋める（merge.ts の findMerge と同じ後処理。prompt.ts 参照）。
    events: applyReceiptEventTiming(receipt, events),
    tripId,
    detailUrl,
  };
}
