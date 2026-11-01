"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { confirmDialog } from "@/components/confirm-dialog";
import { CopyIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";

import { disconnectAiAction } from "./actions";

// AI 連携のページの、手で触る部品（接続先のコピー・AI との連携を解除）。

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

// チャットで頼んで足す AI（Muse）の、依頼文をコピーしてチャットを開くボタン。
// 依頼文入りで開ける環境（PC の web）ならそのまま送れ、入らない環境（スマホの
// アプリ）でも貼るだけで済む。開く前にコピーするのは、別のタブ・アプリに
// 移った後ではコピーできないため。
export function CopyAndOpen({
  text,
  href,
  label,
}: {
  text: string;
  href: string;
  label: string;
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // クリップボード不可の環境は無視（PC の web は依頼文入りで開くので困らない）
    }
    window.open(href, "_blank", "noopener");
  };
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={copy}
      className="gap-1.5"
    >
      <CopyIcon size={16} />
      {label}
    </Button>
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
        confirmLabel: t("disconnectConfirm"),
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
