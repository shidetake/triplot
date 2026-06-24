"use client";

import { useTranslations } from "next-intl";

import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";

// per-user の取り込みアドレスは「読むもの」でなく「コピーして使うもの」なので、
// 値は出さずコピーボタンだけにする（ui-guidelines フィードバック/文言）。
// 値が無い＝対象を文字で示す必要があり、「コピー」と書くのでアイコンは付けない。
export function ImportAddress({ address }: { address: string }) {
  const tImport = useTranslations("import");
  const tCommon = useTranslations("common");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast(tCommon("copied"));
    } catch {
      // クリップボード不可の環境は無視
    }
  };

  return (
    <Button type="button" variant="outline" onClick={copy}>
      {tImport("copyAddress")}
    </Button>
  );
}
