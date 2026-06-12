"use client";

import { toast } from "@/components/toast";

// per-user の取り込みアドレスは「読むもの」でなく「コピーして使うもの」なので、
// 値は出さずコピーボタンだけにする（design-guidelines フィードバック/文言）。
// 値が無い＝対象を文字で示す必要があり、「コピー」と書くのでアイコンは付けない。
export function ImportAddress({ address }: { address: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast("コピーしました");
    } catch {
      // クリップボード不可の環境は無視
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-3 text-sm text-muted-foreground transition hover:bg-foreground/10"
    >
      アドレスをコピー
    </button>
  );
}
