"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { MessageBox } from "@/components/message-box";
import { Button } from "@/components/ui/button";

// データ取得に失敗した時の最後の砦。ブラウザの更新任せにせず、その場で
// router.refresh() による再試行を提供する（apps/mobile の QueryErrorView と
// 同じ考え方）。Server Component から差し込むだけで使えるよう、状態は
// この Client Component の中に閉じる。
export function LoadError({ message }: { message: string }) {
  const t = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-start gap-3">
      <MessageBox kind="error">{t("loadError", { message })}</MessageBox>
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={() => startTransition(() => router.refresh())}
      >
        {t("retry")}
      </Button>
    </div>
  );
}
