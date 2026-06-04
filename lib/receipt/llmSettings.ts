// BYO-APIキー（クライアント側）の設定とブラウザ保管。
// 方針（合意済み）: 推論はユーザ自身のキー/アカウントで動かす（BYOK）。キーは
// ユーザ本人の端末内（localStorage）にのみ置き、サーバには保存しない。
// ＝提供者はキーも推論費も持たない。[[feedback_byok_not_operator_pays]]

export type LlmProvider = "google" | "anthropic" | "openai";

export type LlmProviderInfo = {
  value: LlmProvider;
  label: string;
  keyUrl: string; // APIキー取得ページ
  keyHint: string; // 取得方法の一言
  defaultModel: string; // 既定モデル（後で上書き可）
};

// 表示順は取得の手軽さ順（Gemini=無料枠あり → 課金が要る2社）。
export const LLM_PROVIDERS: LlmProviderInfo[] = [
  {
    value: "google",
    label: "Gemini（Google）",
    keyUrl: "https://aistudio.google.com/",
    keyHint: "Google AI Studio で取得（無料枠あり）",
    defaultModel: "gemini-2.5-flash",
  },
  {
    value: "anthropic",
    label: "Claude（Anthropic）",
    keyUrl: "https://console.anthropic.com/",
    keyHint: "Anthropic Console で取得（API課金が別途必要）",
    defaultModel: "claude-haiku-4-5-20251001",
  },
  {
    value: "openai",
    label: "ChatGPT（OpenAI）",
    keyUrl: "https://platform.openai.com/api-keys",
    keyHint: "OpenAI Platform で取得（API課金が別途必要）",
    defaultModel: "gpt-4o-mini",
  },
];

export function providerInfo(p: LlmProvider): LlmProviderInfo {
  return LLM_PROVIDERS.find((x) => x.value === p) ?? LLM_PROVIDERS[0];
}

export type LlmSettings = { provider: LlmProvider; apiKey: string };

const STORAGE_KEY = "triplot.llm.v1";

export function loadLlmSettings(): LlmSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as LlmSettings;
    if (!v.provider || typeof v.apiKey !== "string") return null;
    return v;
  } catch {
    return null;
  }
}

export function saveLlmSettings(s: LlmSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function clearLlmSettings(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
