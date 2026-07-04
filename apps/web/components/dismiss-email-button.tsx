"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";

import { confirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toast";

import { CloseButton } from "./close-button";

// 受信箱のメール破棄（×）。取り消せない操作なので、他の破壊的操作と同じく
// confirmDialog を挟んでから呼ぶ（form action への直接 submit はしない）。
export function DismissEmailButton({
  id,
  action,
  className,
}: {
  id: string;
  action: (id: string) => Promise<{ error: string | null }>;
  className?: string;
}) {
  const t = useTranslations("import");
  const [isPending, startTransition] = useTransition();

  const onClick = async () => {
    if (!(await confirmDialog({ title: t("dismissEmailTitle") }))) return;
    startTransition(async () => {
      const { error } = await action(id);
      if (error) toast(t("dismissFailed", { error }));
    });
  };

  return (
    <CloseButton
      label={t("dismiss")}
      onClick={onClick}
      disabled={isPending}
      className={className}
    />
  );
}
