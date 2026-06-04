"use client";

import { useEffect, useState } from "react";

import {
  clearLlmSettings,
  LLM_PROVIDERS,
  loadLlmSettings,
  type LlmProvider,
  providerInfo,
  saveLlmSettings,
} from "@/lib/receipt/llmSettings";

import { CheckIcon } from "./icons";

// BYO-APIキーの入力UI（① 取り込み用のLLMキー登録）。キーは端末内(localStorage)
// にのみ保存し、triplot のサーバには送らない。
export function LlmKeySettings() {
  const [provider, setProvider] = useState<LlmProvider>("google");
  const [apiKey, setApiKey] = useState("");
  const [savedProvider, setSavedProvider] = useState<LlmProvider | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    // localStorage は client 専用なのでマウント後に読む（SSR では読めない）。
    const s = loadLlmSettings();
    if (s) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setProvider(s.provider);
      setSavedProvider(s.provider);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, []);

  const info = providerInfo(provider);

  const handleSave = () => {
    if (!apiKey.trim()) return;
    saveLlmSettings({ provider, apiKey: apiKey.trim() });
    setSavedProvider(provider);
    setApiKey("");
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
  };

  const handleClear = () => {
    clearLlmSettings();
    setSavedProvider(null);
    setApiKey("");
  };

  return (
    <section className="space-y-4 rounded-lg border border-zinc-200 p-5">
      <div>
        <h2 className="font-medium">AI（レシート取り込み）</h2>
        <p className="mt-1 text-sm text-zinc-600">
          転送したレシートメールを読み取るために、あなたの AI の APIキーを使います。
          キーは<strong>この端末内にのみ保存</strong>され、triplot
          のサーバには送信されません。
        </p>
      </div>

      <div className="text-sm">
        現在:{" "}
        {savedProvider ? (
          <span className="inline-flex items-center gap-1 font-medium text-zinc-900">
            <CheckIcon size={14} />
            {providerInfo(savedProvider).label} 登録済み
          </span>
        ) : (
          <span className="text-zinc-500">未登録</span>
        )}
      </div>

      <label className="block text-sm">
        <span className="font-medium">プロバイダ</span>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as LlmProvider)}
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 focus:border-black focus:outline-none"
        >
          {LLM_PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="font-medium">APIキー</span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={
            savedProvider === provider
              ? "登録済み（変更する場合のみ入力）"
              : "APIキーを貼り付け"
          }
          autoComplete="off"
          className="mt-1 block w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 focus:border-black focus:outline-none"
        />
        <span className="mt-1 block text-xs text-zinc-500">
          {info.keyHint}（
          <a
            href={info.keyUrl}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-zinc-700"
          >
            取得ページ
          </a>
          ）
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!apiKey.trim()}
          className="h-9 rounded-md bg-black px-5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40"
        >
          保存
        </button>
        {savedProvider && (
          <button
            type="button"
            onClick={handleClear}
            className="h-9 rounded-md border border-zinc-300 px-4 text-sm text-zinc-700 transition hover:bg-zinc-100"
          >
            削除
          </button>
        )}
        {justSaved && (
          <span className="text-sm text-green-700">保存しました</span>
        )}
      </div>
    </section>
  );
}
