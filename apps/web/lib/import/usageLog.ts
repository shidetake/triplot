import type { LanguageModelUsage } from "ai";

// LLM 呼び出し1回ぶんのトークン内訳をログに残す。
//
// **キャッシュが効いているかは、効いているはずでは分からない。** Gemini 2.5 系の
// implicit caching は設定不要で自動だが、先頭が一致しなければ黙って外れる
// （エラーにならない）。単価が倍違うのに気付けないので、cached を数字で出す。
//
// 出す先は Vercel の関数ログ（既存の "[import] body" / "[import] enrich" と同じ
// 形）。テーブルには入れない —— ai_usage は Gateway の累計額だけを見ており、
// ここで欲しいのは「今の実装でキャッシュが乗っているか」という開発時の確認で、
// 恒久的に貯める値ではない。
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
