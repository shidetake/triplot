"use client";

import { useCallback, useMemo, useState } from "react";

import { buildSchedule, type ScheduleEvent } from "@/lib/schedule";

import { EventForm, type EventFormMode } from "./event-form";
import { WeekCalendar } from "./week-calendar";

export type EventRow = ScheduleEvent & { createdByMemberId: string };

export function ScheduleSection({
  tripId,
  tripTimeZone,
  tripStart,
  tripEnd,
  events,
  places,
  myMemberId,
}: {
  tripId: string;
  tripTimeZone: string;
  tripStart: string | null;
  tripEnd: string | null;
  events: EventRow[];
  places: { id: string; name: string }[];
  myMemberId: string;
}) {
  const [form, setForm] = useState<EventFormMode | null>(null);

  const schedule = useMemo(
    () =>
      buildSchedule(events, {
        tripTz: tripTimeZone,
        tripStart,
        tripEnd,
      }),
    [events, tripTimeZone, tripStart, tripEnd],
  );

  const placeName = useCallback(
    (id: string | null) =>
      id ? (places.find((p) => p.id === id)?.name ?? null) : null,
    [places],
  );

  const closeForm = useCallback(() => setForm(null), []);

  const defaultDate =
    tripStart ?? new Date().toISOString().slice(0, 10);

  const openCreate = (kind: "normal" | "transit") => {
    setForm({
      mode: "create",
      kind,
      date: defaultDate,
      time: "09:00",
      tz: tripTimeZone,
    });
  };

  const onSlotClick = useCallback(
    (date: string, tz: string, minutes: number) => {
      const h = String(Math.floor(minutes / 60)).padStart(2, "0");
      const m = String(minutes % 60).padStart(2, "0");
      setForm({
        mode: "create",
        kind: "normal",
        date,
        time: `${h}:${m}`,
        tz,
      });
    },
    [],
  );

  const onEventClick = useCallback(
    (eventId: string) => {
      const ev = events.find((e) => e.id === eventId);
      if (!ev) return;
      setForm({
        mode: "edit",
        event: ev,
        canChangeVisibility: ev.createdByMemberId === myMemberId,
      });
    },
    [events, myMemberId],
  );

  const selectedEventId =
    form?.mode === "edit" ? form.event.id : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => openCreate("normal")}
          className="h-9 rounded-md bg-black px-3 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          ＋ 予定を追加
        </button>
        <button
          type="button"
          onClick={() => openCreate("transit")}
          className="h-9 rounded-md border border-violet-300 bg-violet-50 px-3 text-sm font-medium text-violet-800 transition hover:bg-violet-100"
        >
          ＋ フライトを追加
        </button>
        <span className="self-center text-xs text-zinc-500">
          空き時間をタップしても追加できます・時刻は全て現地時刻（端末設定に依存しません）
        </span>
      </div>

      <WeekCalendar
        schedule={schedule}
        placeName={placeName}
        selectedEventId={selectedEventId}
        onSlotClick={onSlotClick}
        onEventClick={onEventClick}
      />

      {form && (
        <EventForm
          tripId={tripId}
          tripTz={tripTimeZone}
          state={form}
          places={places}
          onDone={closeForm}
        />
      )}
    </div>
  );
}
