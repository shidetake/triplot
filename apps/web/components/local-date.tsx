"use client";

import { useLocale } from "next-intl";
import { useSyncExternalStore } from "react";

import { formatDayLabel } from "@triplot/shared/schedule";
import { formatYmd } from "@triplot/shared/ymd";

// 日時（timestamptz の ISO 文字列）を、見ている人のブラウザのタイムゾーンの日付にする。
//
// サーバーは見ている人のタイムゾーンを知らない（Vercel は UTC で動く）ので、
// サーバー描画で日付にすると、日本では朝9時より前の出来事が前の日になる。
// 日付にするのはブラウザに入ってから。サーバー描画とハイドレーションの間は
// 何も出さない（UTC の日付を一瞬出してから変わる、ということをしない）。
//
// 1日ごとに数えた集計（ai_usage_daily 等）はこれを使わない。DB が UTC の日で
// 区切って数えているので、表示だけ変えても区切りは UTC のまま。
export type LocalDateStyle =
  | "ymd" // 2026-11-02（管理ページの表）
  | "dayLabel" // 11/2(月)
  | "locale"; // 2026/11/2（言語に合わせた年月日）

const subscribe = () => () => {};

export function useLocalDateFormat(): ((
  iso: string,
  style: LocalDateStyle,
) => string) | null {
  const locale = useLocale();
  const inBrowser = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (!inBrowser) return null;
  return (iso, style) => {
    const d = new Date(iso);
    if (style === "ymd") return formatYmd(d);
    if (style === "dayLabel") return formatDayLabel(formatYmd(d), locale);
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).format(d);
  };
}

export function LocalDate({
  iso,
  style,
}: {
  iso: string;
  style: LocalDateStyle;
}) {
  const format = useLocalDateFormat();
  return format ? format(iso, style) : null;
}
