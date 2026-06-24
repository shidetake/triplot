"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { CloseIcon } from "./icons";

// ポップアップ/フォーム右上の × 閉じるボタン（ui-guidelines「定型部品」）。
// subtle 色・rounded-full・h-6 の独自レシピを1ソース化。label は読み上げ/ツールチップ
// （既定「閉じる」）。位置・サイズ調整は className で渡す（負マージン・h-7 等）。
// type/onClick 等は ...props で透過（form 送信の「破棄」等にも使える。既定 type="button"）。
export function CloseButton({
  label,
  className,
  iconSize = 16,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label?: string;
  iconSize?: number;
}) {
  const t = useTranslations("common");
  const resolvedLabel = label ?? t("close");
  return (
    <button
      type="button"
      aria-label={resolvedLabel}
      title={resolvedLabel}
      {...props}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-full text-subtle-foreground transition hover:bg-foreground/10 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <CloseIcon size={iconSize} />
    </button>
  );
}
