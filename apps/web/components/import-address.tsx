"use client";

import { useTranslations } from "next-intl";

import { CopyIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";

// per-user の取り込みアドレス。**値を出す**（以前は「読むものでなくコピーして
// 使うもの」としてコピーボタンだけにしていたが、別の端末で手で打つ・正しい
// アドレスに送れているか確かめる、という読む用途がある。隠して得られるのは
// ボタン1つぶんの省スペースだけ）。RN の import-sheet と同じ形に揃えてある。
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
    <div className="rounded-md border border-foreground/10 p-3">
      <div className="text-xs text-muted-foreground">
        {tImport("forwardLabel")}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm">{address}</span>
        <Button
          type="button"
          variant="ghost"
          size="iconSm"
          onClick={copy}
          aria-label={tImport("copyAddress")}
          title={tImport("copyAddress")}
          className="shrink-0 text-muted-foreground"
        >
          <CopyIcon size={16} />
        </Button>
      </div>
    </div>
  );
}
