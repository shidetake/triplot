"use client";

import { useCallback, useMemo, useState } from "react";

import type { LatLng } from "@/lib/placeMap";
import { buildSchedule, type ScheduleEvent } from "@/lib/schedule";

import { EventForm, type EventFormMode } from "./event-form";
import { CheckIcon, PlusIcon } from "./icons";
import { ReservationIcon } from "./reservation-icon";
import { type Anchor, FormPopover } from "./form-popover";
import { type PcDragRender, WeekCalendar } from "./week-calendar";

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
  // PC ドラッグで作成中の可変長ゴースト。form 表示中も枠を残したいので
  // ScheduleSection で保持し、closeForm で同期的に消す。
  const [pcDrag, setPcDrag] = useState<PcDragRender | null>(null);

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

  const closeForm = useCallback(() => {
    setOpen(null);
    // PC ドラッグのゴーストも form を閉じたタイミングで消す
    // （ドラッグ→form→確定/キャンセル の一連で見た目が連続するように）。
    setPcDrag(null);
  }, []);

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
    (
      date: string,
      tz: string,
      minutes: number,
      anchor: Anchor,
      endMinutes?: number,
    ) => {
      const h = String(Math.floor(minutes / 60)).padStart(2, "0");
      const m = String(minutes % 60).padStart(2, "0");
      // PC ドラッグで終了時刻も指定された時はそれを form に渡す。
      let endTime: string | undefined;
      if (endMinutes != null) {
        const eh = String(Math.floor(endMinutes / 60)).padStart(2, "0");
        const em = String(endMinutes % 60).padStart(2, "0");
        endTime = `${eh}:${em}`;
      }
      // 列のTZ（旅程から導出）を初期値に。情報が無い列(UTC)なら前回入力TZ。
      setOpen({
        form: {
          mode: "create",
          date,
          time: `${h}:${m}`,
          tz: tz === "UTC" ? defaultTz : tz,
          ...(endTime ? { endTime } : {}),
        },
        anchor,
      });
    },
    [defaultTz],
  );

  // 終日帯の空きを長押し→離した時に呼ばれる。終日種別をプリセットで開く。
  const onAllDaySlotClick = useCallback(
    (date: string, anchor: Anchor) => {
      setOpen({
        form: {
          mode: "create",
          date,
          time: "00:00", // 終日では使われない
          tz: defaultTz, // 同上
          allDay: true,
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

  // 予約マーカーの凡例。予約のある予定が1件でもある時だけ出す。
  const hasReservation = events.some((e) => e.needsReservation);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-medium">スケジュール</h2>
        <div className="flex items-center gap-2">
          <span className="group relative inline-flex">
            <span
              tabIndex={0}
              role="img"
              aria-label="予定の追加方法"
              className="flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-zinc-200 text-[10px] font-bold text-zinc-600"
            >
              ?
            </span>
            <span className="pointer-events-none absolute bottom-full right-0 z-10 mb-1 w-52 rounded-md bg-zinc-800 px-2 py-1.5 text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              空き時間をクリック / 長押しでも追加できます
            </span>
          </span>
          <button
            type="button"
            onClick={openCreate}
            aria-label="予定を追加"
            className="flex h-9 w-9 items-center justify-center rounded-md bg-black text-white transition hover:bg-zinc-800"
          >
            <PlusIcon size={18} />
          </button>
        </div>
      </div>

      <WeekCalendar
        schedule={schedule}
        placeName={placeName}
        selectedEventId={selectedEventId}
        pcDrag={pcDrag}
        onPcDragChange={setPcDrag}
        onSlotClick={onSlotClick}
        onAllDaySlotClick={onAllDaySlotClick}
        onEventClick={onEventClick}
      />

      {hasReservation && (
        <div className="flex items-center gap-4 text-[11px] text-zinc-500">
          <span className="inline-flex items-center gap-1">
            <ReservationIcon size={12} />
            要予約
          </span>
          <span className="inline-flex items-center gap-1">
            <CheckIcon size={12} className="text-zinc-400" />
            予約済
          </span>
        </div>
      )}

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
