"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { type GcalEventInput, toGcalEvent } from "@/lib/gcalEvent";

import { type Anchor, FormPopover } from "./form-popover";
import { CheckIcon } from "./icons";
import { menuItemClass } from "./menu-item";

// Google Identity Services（GIS）のトークンクライアント最小型。
// 公式 d.ts は使わず、使う分だけ宣言する。
type TokenResponse = { access_token?: string; error?: string };
type TokenClient = {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
};
type GsiOAuth2 = {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (resp: TokenResponse) => void;
  }) => TokenClient;
};
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GsiOAuth2 } };
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";
const SCOPE = "https://www.googleapis.com/auth/calendar";

type CalendarItem = { id: string; summary: string; accessRole: string };

// エクスポート対象の予定。mine = 自分が参加する予定か（全員予定 or 自分が当事者）。
// 変換に必要な GcalEventInput に、スコープ絞り込み用の mine を足したもの。
export type CalendarExportEvent = GcalEventInput & { mine: boolean };

// GIS スクリプトを一度だけ読み込む。
function loadGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("gisLoadFailed")),
      );
      return;
    }
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () =>
      reject(new Error("gisLoadFailed"));
    document.head.appendChild(s);
  });
}

type Phase =
  | "connect" // 未接続。Google に接続ボタン
  | "loading" // calendarList 取得中
  | "pick" // カレンダー選択
  | "exporting" // 予定を書き込み中
  | "done"
  | "error";

const NEW = "__new__";

// スケジュールを Google カレンダーへエクスポートするダイアログ（B: GIS ポップアップ
// トークンフロー）。アクセストークンは state にだけ持ち、永続化しない。
export function CalendarExportDialog({
  anchor,
  onClose,
  tripTitle,
  events,
}: {
  anchor: Anchor;
  onClose: () => void;
  tripTitle: string;
  events: CalendarExportEvent[];
}) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;

  const [phase, setPhase] = useState<Phase>("connect");
  const [error, setError] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<CalendarItem[]>([]);
  const [selected, setSelected] = useState<string>(NEW);
  const [newName, setNewName] = useState(`triplot_${tripTitle}`);
  // 出力範囲。既定は「自分が参加する予定だけ」。
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });

  const t = useTranslations("calendarExport");
  const tokenRef = useRef<string | null>(null);
  const clientRef = useRef<TokenClient | null>(null);

  // scope に応じた実際の出力対象。
  const mineEvents = events.filter((e) => e.mine);
  const targetEvents = scope === "mine" ? mineEvents : events;

  // 書き込み可能なカレンダーを取得。
  const fetchCalendars = useCallback(async (token: string) => {
    setPhase("loading");
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer&maxResults=250",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(t("calendarListFailed", { status: res.status }));
    const json = (await res.json()) as { items?: CalendarItem[] };
    const items = (json.items ?? []).filter(
      (c) => c.accessRole === "writer" || c.accessRole === "owner",
    );
    setCalendars(items);
    // 既定は「新規カレンダー作成」。
    setSelected(NEW);
    setPhase("pick");
  }, []);

  const connect = useCallback(() => {
    setError(null);
    if (!clientId) {
      setError(t("missingClientId"));
      setPhase("error");
      return;
    }
    // gisLoadFailed / gisInitFailed are thrown as key strings since loadGis() is module-level.
    const GIS_KEYS: Record<string, string> = {
      gisLoadFailed: t("gisLoadFailed"),
      gisInitFailed: t("gisInitFailed"),
    };
    loadGis()
      .then(() => {
        const oauth2 = window.google?.accounts?.oauth2;
        if (!oauth2) throw new Error("gisInitFailed");
        clientRef.current = oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPE,
          callback: (resp) => {
            if (resp.error || !resp.access_token) {
              setError(t("authCancelled"));
              setPhase("error");
              return;
            }
            tokenRef.current = resp.access_token;
            fetchCalendars(resp.access_token).catch((e) => {
              setError(e instanceof Error ? e.message : String(e));
              setPhase("error");
            });
          },
        });
        // 既に同意済みなら無音で、未同意なら同意画面が出る（prompt 省略）。
        clientRef.current.requestAccessToken();
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setError(GIS_KEYS[msg] ?? msg);
        setPhase("error");
      });
  }, [clientId, fetchCalendars]);

  // 接続後、選んだ（or 新規作成した）カレンダーへ全予定を書き込む。
  const runExport = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    setError(null);
    setPhase("exporting");
    try {
      let calendarId = selected;
      if (selected === NEW) {
        const name = newName.trim() || `triplot_${tripTitle}`;
        const res = await fetch(
          "https://www.googleapis.com/calendar/v3/calendars",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ summary: name }),
          },
        );
        if (!res.ok)
          throw new Error(t("calendarCreateFailed", { status: res.status }));
        const created = (await res.json()) as { id: string };
        calendarId = created.id;
      }

      let done = 0;
      let failed = 0;
      setProgress({ done: 0, total: targetEvents.length, failed: 0 });
      // 直列で投入（レート制限・部分失敗の把握を簡単にする）。
      for (const ev of targetEvents) {
        const body = toGcalEvent(ev);
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
            body: JSON.stringify(body),
          },
        );
        if (res.ok) done += 1;
        else failed += 1;
        setProgress({ done, total: targetEvents.length, failed });
      }
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [selected, newName, tripTitle, targetEvents]);

  const btnBlack =
    "h-9 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50";
  const btnGhost =
    "h-9 w-full rounded-md border border-foreground/20 text-sm font-medium text-muted-foreground transition hover:bg-foreground/10";

  return (
    <FormPopover anchor={anchor} onClose={onClose} label={t("formLabel")}>
      <div className="space-y-3 p-4">
        <p className="text-sm font-medium text-foreground">
          {t("heading")}
        </p>

        {(phase === "connect" || phase === "pick") && (
          <div className="space-y-1">
            <label className={`flex items-center gap-2 rounded-md ${menuItemClass}`}>
              <input
                type="radio"
                name="scope"
                checked={scope === "mine"}
                onChange={() => setScope("mine")}
              />
              <span>{t("scopeMine", { count: mineEvents.length })}</span>
            </label>
            <label className={`flex items-center gap-2 rounded-md ${menuItemClass}`}>
              <input
                type="radio"
                name="scope"
                checked={scope === "all"}
                onChange={() => setScope("all")}
              />
              <span>{t("scopeAll", { count: events.length })}</span>
            </label>
          </div>
        )}

        {phase === "connect" && (
          <button type="button" onClick={connect} className={btnBlack}>
            {t("connectButton")}
          </button>
        )}

        {phase === "loading" && (
          <p className="py-2 text-center text-sm text-muted-foreground">
            {t("loading")}
          </p>
        )}

        {phase === "pick" && (
          <div className="space-y-3">
            <div className="max-h-64 space-y-1 overflow-y-auto">
              <label className={`flex items-center gap-2 rounded-md ${menuItemClass}`}>
                <input
                  type="radio"
                  name="cal"
                  checked={selected === NEW}
                  onChange={() => setSelected(NEW)}
                />
                <span>{t("newCalendar")}</span>
              </label>
              {selected === NEW && (
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={`triplot_${tripTitle}`}
                  className="ml-6 w-[calc(100%-1.5rem)] rounded-md border border-foreground/20 px-2 py-1.5 text-sm"
                />
              )}
              {calendars.map((c) => (
                <label
                  key={c.id}
                  className={`flex items-center gap-2 rounded-md ${menuItemClass}`}
                >
                  <input
                    type="radio"
                    name="cal"
                    checked={selected === c.id}
                    onChange={() => setSelected(c.id)}
                  />
                  <span className="truncate">{c.summary}</span>
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={runExport}
              disabled={targetEvents.length === 0}
              className={btnBlack}
            >
              {t("exportButton", { count: targetEvents.length })}
            </button>
          </div>
        )}

        {phase === "exporting" && (
          <p className="py-2 text-center text-sm text-muted-foreground">
            {t("exporting", { done: progress.done, total: progress.total })}
            {progress.failed > 0 && t("failedCount", { count: progress.failed })}
          </p>
        )}

        {phase === "done" && (
          <div className="space-y-3">
            <p className="flex items-center justify-center gap-1.5 py-1 text-sm text-foreground">
              <CheckIcon size={16} />
              {t("successMessage", { done: progress.done })}
              {progress.failed > 0 && t("failedCount", { count: progress.failed })}
            </p>
            <a
              href="https://calendar.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className={`${btnGhost} flex items-center justify-center`}
            >
              {t("openGcal")}
            </a>
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-3">
            <p className="text-sm text-red-600">{error}</p>
            <button type="button" onClick={connect} className={btnGhost}>
              {t("retry")}
            </button>
          </div>
        )}
      </div>
    </FormPopover>
  );
}
