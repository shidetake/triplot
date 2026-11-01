"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { confirmDialog } from "@/components/confirm-dialog";
import { CopyIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";

import { disconnectAiAction } from "./actions";

// AI につなぐページの、手で触る部品（接続先のコピー・AI を外す）。

// 接続先の URL。取り込みアドレス（import-address.tsx）と同じく、値を出したうえで
// コピーできるようにする（別の端末で手で打つ・合っているか見比べる用途がある）。
export function McpUrl({ url }: { url: string }) {
  const t = useTranslations("ai");
  const tCommon = useTranslations("common");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast(tCommon("copied"));
    } catch {
      // クリップボード不可の環境は無視
    }
  };
  return (
    <div className="rounded-md border border-foreground/10 p-3">
      <div className="text-xs text-muted-foreground">{t("urlLabel")}</div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm">{url}</span>
        <Button
          type="button"
          variant="ghost"
          size="iconSm"
          onClick={copy}
          aria-label={t("copyUrl")}
          title={t("copyUrl")}
          className="shrink-0 text-muted-foreground"
        >
          <CopyIcon size={16} />
        </Button>
      </div>
    </div>
  );
}

export function DisconnectAiButton({
  clientId,
  name,
}: {
  clientId: string;
  name: string;
}) {
  const t = useTranslations("ai");
  const [busy, setBusy] = useState(false);
  const disconnect = async () => {
    if (
      !(await confirmDialog({
        title: t("disconnectConfirmTitle", { name }),
        body: t("disconnectConfirmBody"),
        confirmLabel: t("disconnect"),
      }))
    ) {
      return;
    }
    setBusy(true);
    const r = await disconnectAiAction(clientId);
    setBusy(false);
    toast(r.ok ? t("disconnected") : t("disconnectFailed"));
  };
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={disconnect}
      disabled={busy}
      className="shrink-0"
    >
      {t("disconnect")}
    </Button>
  );
}
