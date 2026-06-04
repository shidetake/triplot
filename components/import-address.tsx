"use client";

import { useState } from "react";

// per-user の取り込みアドレスを表示してコピーできる小UI。
export function ImportAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボード不可の環境は無視（手動選択でコピー可能）
    }
  };

  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm">
        {address}
      </code>
      <button
        type="button"
        onClick={copy}
        className="h-9 shrink-0 rounded-md border border-zinc-300 px-3 text-sm text-zinc-700 transition hover:bg-zinc-100"
      >
        {copied ? "コピー済" : "コピー"}
      </button>
    </div>
  );
}
