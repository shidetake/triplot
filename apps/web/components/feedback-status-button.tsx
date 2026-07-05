"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/toast";

// /admin のフィードバック行の対応状態トグル（対応済みにする ⇄ 未対応に戻す）。
// 可逆な操作なので確認ダイアログは挟まない。
export function FeedbackStatusButton({
  id,
  status,
  action,
}: {
  id: string;
  status: "open" | "done";
  action: (id: string, status: "open" | "done") => Promise<{ error: string | null }>;
}) {
  const t = useTranslations("admin");
  const [isPending, startTransition] = useTransition();
  const next = status === "open" ? "done" : "open";

  const onClick = () => {
    startTransition(async () => {
      const { error } = await action(id, next);
      if (error) toast(t("updateFailed", { error }));
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={isPending}
      className="shrink-0"
    >
      {status === "open" ? t("markDone") : t("markOpen")}
    </Button>
  );
}
