"use client";

import { CopyIcon } from "@/components/icons";
import { toast } from "@/components/toast";

// per-user の取り込みアドレスを表示してコピーできる小UI。
export function ImportAddress({ address }: { address: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast("コピーしました");
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
        aria-label="コピー"
        title="コピー"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-300 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
      >
        <CopyIcon size={16} />
      </button>
    </div>
  );
}
