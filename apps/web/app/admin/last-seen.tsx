"use client";

import { useTranslations } from "next-intl";

import { useLocalDateFormat } from "@/components/local-date";

// 明細リンクの候補ホストの「最終 11/2(月)」。日付は見ている人のタイムゾーンで
// 出すので、文言ごとブラウザで組み立てる（components/local-date.tsx）。
export function LastSeen({ iso }: { iso: string }) {
  const t = useTranslations("admin");
  const format = useLocalDateFormat();
  return format ? t("lastSeen", { date: format(iso, "dayLabel") }) : null;
}
