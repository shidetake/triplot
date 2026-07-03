import { formatDayLabel } from "@triplot/shared/schedule";

import type { EventDraft } from "./schema";

// 予定下書きの日時ラベル（一覧・確定ボタンに出す）。日付は M/D(曜)（ui-guidelines の
// 日時表示整形に従い手書きしない）、時刻は抽出済みの HH:MM をそのまま。
// 受信箱と旅行画面で共有する（単一の真実）。
export function eventDraftWhenLabel(ev: EventDraft, locale: string): string {
  const day = (s: string) => formatDayLabel(s, locale);
  if (ev.kind === "transit") {
    const arrive = [ev.endDate ? day(ev.endDate) : "", ev.endTime ?? ""]
      .filter(Boolean)
      .join(" ");
    return `${day(ev.startDate)} ${ev.startTime ?? ""} → ${arrive}`.trim();
  }
  if (ev.kind === "allday") {
    return ev.endDate
      ? `${day(ev.startDate)} → ${day(ev.endDate)}`
      : day(ev.startDate);
  }
  return `${day(ev.startDate)}${ev.startTime ? ` ${ev.startTime}` : ""}`;
}
