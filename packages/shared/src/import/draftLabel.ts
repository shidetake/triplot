import { formatDayLabel } from "../schedule";

import type { EventDraft, Extraction } from "./schema";

// 取り込み下書きカードの狭い表示幅向け。年・曜日を省いた "M/D" だけ
// （ui-guidelines の日付整形の基本形。カードは横幅が厳しいので年は省く）。
export function monthDayLabel(ymd: string): string {
  const [, mo, d] = ymd.split("-").map(Number);
  return `${mo}/${d}`;
}

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

// 合体されたメール1通ぶんの要約（店名 or 予定タイトル / 金額 / 日付）。
// 受信箱の「N通を合体」を開いた時の各行に出す。web・RN で共用。
export function extractionSummary(
  x: Extraction | null,
  fallback: string,
): { title: string; amount: string | null; date: string | null } {
  const first = x?.events[0] ?? null;
  return {
    title: x?.receipt?.merchant || first?.title || fallback,
    amount: x?.receipt ? `${x.receipt.total} ${x.receipt.currency}` : null,
    date: x?.receipt?.date ?? first?.startDate ?? null,
  };
}
