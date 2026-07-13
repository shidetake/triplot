// Google Calendar API (v3) の REST 呼び出し（web / RN 共用）。
// アクセストークンの取得はプラットフォーム側の責務（web = GIS ポップアップ、
// RN = native Google Sign-In の addScopes）。ここは Bearer トークンを受けて
// fetch するだけ。スコープは calendar.app.created 前提＝見える/書けるのは
// このアプリが作ったカレンダーのみ。

import type { GcalEvent } from "./gcalEvent";

export const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";

export type GcalCalendarItem = {
  id: string;
  summary: string;
  accessRole: string;
};

// API 失敗を step 付きで投げる（呼び出し側が i18n メッセージに変換する）。
export class GcalApiError extends Error {
  constructor(
    public step: "calendarList" | "calendarCreate",
    public status: number,
  ) {
    super(`gcal ${step} failed: ${status}`);
  }
}

/** 書き込み先候補＝このアプリが作ったカレンダーの一覧。 */
export async function listWritableGcalCalendars(
  token: string,
): Promise<GcalCalendarItem[]> {
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer&maxResults=250",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new GcalApiError("calendarList", res.status);
  const json = (await res.json()) as { items?: GcalCalendarItem[] };
  return (json.items ?? []).filter(
    (c) => c.accessRole === "writer" || c.accessRole === "owner",
  );
}

/** カレンダーを新規作成して id を返す。 */
export async function createGcalCalendar(
  token: string,
  name: string,
): Promise<string> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ summary: name }),
  });
  if (!res.ok) throw new GcalApiError("calendarCreate", res.status);
  const created = (await res.json()) as { id: string };
  return created.id;
}

/** 予定を1件投入。成功可否だけ返す（部分失敗は呼び出し側が数える）。 */
export async function insertGcalEvent(
  token: string,
  calendarId: string,
  ev: GcalEvent,
): Promise<boolean> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId,
    )}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(ev),
    },
  );
  return res.ok;
}
