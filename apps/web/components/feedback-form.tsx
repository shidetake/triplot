"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { FEEDBACK_BODY_MAX, type FeedbackKind } from "@triplot/shared/feedback";

import { Button } from "@/components/ui/button";
import { CloseButton } from "./close-button";
import { FieldLabel } from "./field-label";
import { useClearDraft, useDraft, useInSheet } from "./form-host";
import { SendIcon } from "./icons";
import { inputClass } from "./input-class";
import { MessageBox } from "./message-box";
import { toast } from "./toast";

// フィードバック（不具合報告・要望）の送信フォーム。アカウントメニューから
// FormPopover / ボトムシートで開く。送信先は /api/feedback（web/RN 共通の単一経路）。
export function FeedbackForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("feedback");
  const locale = useLocale();
  const pathname = usePathname();
  const inSheet = useInSheet();
  const clearDraft = useClearDraft();

  const [kind, setKind] = useDraft<FeedbackKind>("kind", "bug");
  const [body, setBody] = useDraft("body", "");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    try {
      // バグ再現用の診断情報。フォームには出さず自動収集する（注記1文のみで告知）。
      // テーマは system 設定の解決後の見た目（<html class="dark"> の有無）を送る。
      const diagnostics = {
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        theme: document.documentElement.classList.contains("dark")
          ? "dark"
          : "light",
      };
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          body,
          path: pathname,
          locale,
          platform: "web",
          ...diagnostics,
        }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      clearDraft();
      toast(t("sent"));
      onDone();
    } catch {
      setError(t("sendFailed"));
      setIsPending(false);
    }
  };

  // セグメントトラックの各セグメント（ui-guidelines「定型部品」。create-trip-form と同型）。
  const seg =
    "flex flex-1 cursor-pointer items-center justify-center rounded px-2 py-1.5 text-xs font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring";

  return (
    <form
      onSubmit={handleSubmit}
      className={`relative space-y-3 p-4 ${inSheet ? "" : "rounded-md border border-foreground/10 bg-background"}`}
    >
      {!inSheet && (
        <CloseButton onClick={onDone} className="absolute right-2 top-2 z-10" />
      )}

      {/* 種別（不具合/要望）。先頭が全幅トラックなので × の右クリアランス mr-7。 */}
      <div
        className={`${inSheet ? "" : "mr-7"} flex gap-1 rounded-md border border-foreground/10 p-1`}
      >
        {(["bug", "feature"] as const).map((k) => (
          <label
            key={k}
            className={`${seg} ${
              kind === k
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-foreground/10"
            }`}
          >
            <input
              type="radio"
              name="kind"
              className="sr-only"
              checked={kind === k}
              onChange={() => setKind(k)}
            />
            {k === "bug" ? t("kindBug") : t("kindFeature")}
          </label>
        ))}
      </div>

      <label className="block min-w-0 text-sm">
        <FieldLabel required>{t("bodyLabel")}</FieldLabel>
        {/* textarea は可変高なので inputClass の固定 h-9 を min-h で上書きする
            （CSS では min-height が height に勝つ）。 */}
        <textarea
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={FEEDBACK_BODY_MAX}
          placeholder={kind === "bug" ? t("placeholderBug") : t("placeholderFeature")}
          className={`mt-1 block w-full min-h-28 resize-y py-2 ${inputClass}`}
        />
      </label>

      <Button
        type="submit"
        disabled={isPending}
        aria-label={t("submit")}
        title={t("submit")}
        className="w-full"
      >
        <SendIcon size={20} />
      </Button>

      <p className="text-xs text-muted-foreground">{t("diagnosticsNote")}</p>

      {error && <MessageBox kind="error">{error}</MessageBox>}
    </form>
  );
}
