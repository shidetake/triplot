import type { LanguageModel, LanguageModelUsage, ProviderMetadata } from "ai";

import type { createServiceClient } from "@/lib/supabase/service";

// LLM を1回呼んだ記録（ai_calls の1行ぶん）。何の処理の費用かは呼んだ側が
// 知っているので（目的と処理の単位）、ここでは呼び出しの結果だけを持つ。
export type LlmCall = {
  model: LanguageModel;
  usage: LanguageModelUsage | undefined;
  providerMetadata: ProviderMetadata | undefined;
};

// 目的の一覧は DB の ai_call_purposes が原本。増やす時は migration で行を足す。
export type AiCallPurpose =
  | "inbound_extract"
  | "inbound_extract_link"
  | "inbound_merge";

// AI Gateway が応答に入れて返す費用（USD。文字列で来る）。無ければ null。
export function gatewayCost(meta: ProviderMetadata | undefined): number | null {
  const raw = meta?.gateway?.cost;
  const n = typeof raw === "string" || typeof raw === "number" ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

// 1回ぶんを ai_calls に残す。**記録の失敗で取り込みを止めない**（費用の把握は
// 診断であって、レシートを失う理由にはならない）。
export async function recordAiCall(
  supabase: ReturnType<typeof createServiceClient>,
  purpose: AiCallPurpose,
  unitId: string,
  call: LlmCall,
): Promise<void> {
  const u = call.usage;
  const { error } = await supabase.from("ai_calls").insert({
    purpose,
    unit_id: unitId,
    model: typeof call.model === "string" ? call.model : call.model.modelId,
    input_tokens: u?.inputTokens ?? 0,
    cached_input_tokens: u?.cachedInputTokens ?? 0,
    output_tokens: u?.outputTokens ?? 0,
    reasoning_tokens: u?.reasoningTokens ?? 0,
    cost_usd: gatewayCost(call.providerMetadata),
  });
  if (error) console.error("[import] ai_calls insert", error.message);
}

// LLM 呼び出し1回ぶんのトークン内訳をログに残す。
//
// **キャッシュが効いているかは、効いているはずでは分からない。** Gemini 2.5 系の
// implicit caching は設定不要で自動だが、先頭が一致しなければ黙って外れる
// （エラーにならない）。単価が倍違うのに気付けないので、cached を数字で出す。
//
// 出す先は Vercel の関数ログ（既存の "[import] body" / "[import] enrich" と同じ
// 形）。トークン数と費用は recordAiCall が ai_calls にも残すが、こちらは
// 「今の実装でキャッシュが乗っているか」をその場で見るための割合まで出す。
//
// **本文は出さない。** 長さと件数だけ（ログに個人のレシートを残さない）。
export function logUsage(stage: string, usage: LanguageModelUsage | undefined) {
  if (!usage) return;
  const input = usage.inputTokens ?? 0;
  const cached = usage.cachedInputTokens ?? 0;
  console.log(
    "[import] usage",
    JSON.stringify({
      stage,
      input,
      cached,
      // 入力のうちキャッシュから来た割合。0 が続くならキャッシュが外れている
      // （プロンプトの先頭が毎回変わっていないか疑う）。
      cachedPct: input > 0 ? Math.round((cached / input) * 100) : 0,
      output: usage.outputTokens ?? 0,
      total: usage.totalTokens ?? 0,
    }),
  );
}
