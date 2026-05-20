"use client";

import { useCallback, useMemo, useState } from "react";

import type { LatLng } from "@/lib/placeMap";
import { buildSchedule, type ScheduleEvent } from "@/lib/schedule";

import { EventForm, type EventFormMode } from "./event-form";
import { type Anchor, FormPopover } from "./form-popover";
import { WeekCalendar } from "./week-calendar";

export type EventRow = ScheduleEvent & { createdByMemberId: string };

type OpenForm = { form: EventFormMode; anchor: Anchor };

export function ScheduleSection({
  tripId,
  initialTz,
  tripStart,
  tripEnd,
  events,
  places,
  biasCenter,
  myMemberId,
}: {
  tripId: string;
  initialTz: string | null; // 前回入力イベントのTZ（無ければ null）
  tripStart: string | null;
  tripEnd: string | null;
  events: EventRow[];
  places: { id: string; name: string }[];
  biasCenter: LatLng; // Google 検索の地理バイアス（既存ピン重心 or 東京）
  myMemberId: string;
}) {
  const [open, setOpen] = useState<OpenForm | null>(null);

  // 個別TZの初期値: 前回入力 → 無ければブラウザのTZ（自宅で計画する想定）。
  // 表示計算には使わない（あくまでフォームの初期選択）。
  const defaultTz = useMemo(() => {
    if (initialTz) return initialTz;
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, [initialTz]);

  const schedule = useMemo(
    () => buildSchedule(events, { tripStart, tripEnd }),
    [events, tripStart, tripEnd],
  );

  const placeName = useCallback(
    (id: string | null) =>
      id ? (places.find((p) => p.id === id)?.name ?? null) : null,
    [places],
  );

  const closeForm = useCallback(() => setOpen(null), []);

  const defaultDate = tripStart ?? new Date().toISOString().slice(0, 10);

  const openCreate = (e: React.MouseEvent) => {
    setOpen({
      form: {
        mode: "create",
        date: defaultDate,
        time: "09:00",
        tz: defaultTz,
      },
      anchor: { x: e.clientX, y: e.clientY },
    });
  };

  const onSlotClick = useCallback(
    (date: string, tz: string, minutes: number, anchor: Anchor) => {
      const h = String(Math.floor(minutes / 60)).padStart(2, "0");
      const m = String(minutes % 60).padStart(2, "0");
      // 列のTZ（旅程から導出）を初期値に。情報が無い列(UTC)なら前回入力TZ。
      setOpen({
        form: {
          mode: "create",
          date,
          time: `${h}:${m}`,
          tz: tz === "UTC" ? defaultTz : tz,
        },
        anchor,
      });
    },
    [defaultTz],
  );

  const onEventClick = useCallback(
    (eventId: string, anchor: Anchor) => {
      const ev = events.find((e) => e.id === eventId);
      if (!ev) return;
      setOpen({
        form: {
          mode: "edit",
          event: ev,
          canChangeVisibility: ev.createdByMemberId === myMemberId,
        },
        anchor,
      });
    },
    [events, myMemberId],
  );

  const selectedEventId =
    open?.form.mode === "edit" ? open.form.event.id : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={openCreate}
          className="h-9 rounded-md bg-black px-3 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          ＋ 予定を追加
        </button>
        <span className="group relative inline-flex self-center">
          <span
            tabIndex={0}
            role="img"
            aria-label="予定の追加方法"
            className="flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-zinc-200 text-[10px] font-bold text-zinc-600"
          >
            ?
          </span>
          <span className="pointer-events-none absolute bottom-full left-0 z-10 mb-1 w-52 rounded-md bg-zinc-800 px-2 py-1.5 text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            空き時間をクリック / 長押しでも追加できます
          </span>
        </span>
      </div>

      <WeekCalendar
        schedule={schedule}
        placeName={placeName}
        selectedEventId={selectedEventId}
        onSlotClick={onSlotClick}
        onEventClick={onEventClick}
      />

      {open && (
        <FormPopover anchor={open.anchor} onClose={closeForm}>
          <EventForm
            tripId={tripId}
            defaultTz={defaultTz}
            state={open.form}
            places={places}
            biasCenter={biasCenter}
            onDone={closeForm}
          />
        </FormPopover>
      )}
    </div>
  );
}
