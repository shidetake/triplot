"use client";

import { useCallback, useMemo, useState } from "react";

import type { LatLng } from "@/lib/placeMap";
import {
  buildSchedule,
  formatMinutes,
  type ScheduleEvent,
} from "@/lib/schedule";

import { Button } from "@/components/ui/button";
import { EventForm, type EventFormMode } from "./event-form";
import { HelpTip } from "./help-tip";
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
  members,
  biasCenter,
  myMemberId,
}: {
  tripId: string;
  initialTz: string | null; // 前回入力イベントのTZ（無ければ null）
  tripStart: string | null;
  tripEnd: string | null;
  events: EventRow[];
  places: { id: string; name: string }[];
  // color は予定ブロック色の決定（1人だけ参加 → その人の hue）に必要。
  members: { id: string; display_name: string; color: number | null }[];
  biasCenter: LatLng; // Google 検索の地理バイアス（既存ピン重心 or 東京）
  myMemberId: string;
}) {
  // 予定の色判定で使う、参加者 id → hue の引き辞書。
  const memberHueById = useMemo(
    () => new Map(members.map((m) => [m.id, m.color])),
    [members],
  );
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
      // PC ドラッグで終了時刻も指定された時はそれを form に渡す。
      const endTime =
        endMinutes != null ? formatMinutes(endMinutes) : undefined;
      // 列のTZ（旅程から導出）を初期値に。情報が無い列(UTC)なら前回入力TZ。
      setOpen({
        form: {
          mode: "create",
          date,
          time: formatMinutes(minutes),
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
        <h2 className="text-lg font-semibold">スケジュール</h2>
        <div className="flex items-center gap-3">
          <HelpTip label="予定の追加方法" align="right" widthClass="w-52">
            空き時間をクリック / 長押しでも追加できます
          </HelpTip>
          <Button
            type="button"
            size="icon"
            onClick={openCreate}
            aria-label="予定を追加"
            title="予定を追加"
          >
            <PlusIcon size={18} />
          </Button>
        </div>
      </div>

      <WeekCalendar
        schedule={schedule}
        placeName={placeName}
        selectedEventId={selectedEventId}
        myMemberId={myMemberId}
        activeMemberCount={members.length}
        memberHueById={memberHueById}
        pcDrag={pcDrag}
        onPcDragChange={setPcDrag}
        onSlotClick={onSlotClick}
        onAllDaySlotClick={onAllDaySlotClick}
        onEventClick={onEventClick}
      />

      {hasReservation && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <ReservationIcon size={12} />
            要予約
          </span>
          <span className="inline-flex items-center gap-1">
            <CheckIcon size={12} className="text-subtle-foreground" />
            予約済
          </span>
        </div>
      )}

      {open && (
        <FormPopover anchor={open.anchor} onClose={closeForm} label="予定">
          <EventForm
            tripId={tripId}
            defaultTz={defaultTz}
            tripStart={tripStart}
            tripEnd={tripEnd}
            state={open.form}
            places={places}
            members={members}
            biasCenter={biasCenter}
            onDone={closeForm}
          />
        </FormPopover>
      )}
    </div>
  );
}
