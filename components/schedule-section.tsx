"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { buildSchedule, type ScheduleEvent } from "@/lib/schedule";

import { EventForm, type EventFormMode } from "./event-form";
import { type Anchor, WeekCalendar } from "./week-calendar";

export type EventRow = ScheduleEvent & { createdByMemberId: string };

type OpenForm = { form: EventFormMode; anchor: Anchor };

// クリック位置の近くに出すポップオーバー。画面外にはみ出さないよう
// マウント後に実寸を測ってクランプする。
function FormPopover({
  anchor,
  onClose,
  children,
}: {
  anchor: Anchor;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: anchor.x,
    top: anchor.y,
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pad = 8;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(pad, Math.min(anchor.x + 8, vw - w - pad));
    const top = Math.max(pad, Math.min(anchor.y, vh - h - pad));
    setPos({ left, top });
  }, [anchor.x, anchor.y]);

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={ref}
        className="fixed z-50 max-h-[80vh] w-[22rem] overflow-y-auto rounded-lg border border-zinc-300 bg-white shadow-xl"
        style={{ left: pos.left, top: pos.top }}
      >
        {children}
      </div>
    </>
  );
}

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
  const [open, setOpen] = useState<OpenForm | null>(null);

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

  const closeForm = useCallback(() => setOpen(null), []);

  const defaultDate = tripStart ?? new Date().toISOString().slice(0, 10);

  const openCreate = (e: React.MouseEvent) => {
    setOpen({
      form: {
        mode: "create",
        date: defaultDate,
        time: "09:00",
        tz: tripTimeZone,
      },
      anchor: { x: e.clientX, y: e.clientY },
    });
  };

  const onSlotClick = useCallback(
    (date: string, tz: string, minutes: number, anchor: Anchor) => {
      const h = String(Math.floor(minutes / 60)).padStart(2, "0");
      const m = String(minutes % 60).padStart(2, "0");
      setOpen({
        form: { mode: "create", date, time: `${h}:${m}`, tz },
        anchor,
      });
    },
    [],
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

      {open && (
        <FormPopover anchor={open.anchor} onClose={closeForm}>
          <EventForm
            tripId={tripId}
            tripTz={tripTimeZone}
            state={open.form}
            places={places}
            onDone={closeForm}
          />
        </FormPopover>
      )}
    </div>
  );
}
