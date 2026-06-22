"use client";

import { toast } from "@/components/toast";

import { Button } from "@/components/ui/button";

// per-user の取り込みアドレスは「読むもの」でなく「コピーして使うもの」なので、
// 値は出さずコピーボタンだけにする（ui-guidelines フィードバック/文言）。
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
    <Button type="button" variant="outline" onClick={copy}>
      アドレスをコピー
    </Button>
  );
}
