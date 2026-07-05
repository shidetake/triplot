"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import type { LatLng } from "@triplot/shared/placeMap";
import {
  buildSchedule,
  buildTripTzTimeline,
  formatMinutes,
  type ScheduleEvent,
} from "@triplot/shared/schedule";
import { resolveInboundDraft } from "@triplot/shared/data/inbox";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { EventForm, type EventFormMode } from "./event-form";
import { HelpTip } from "./help-tip";
import { CheckIcon, PlusIcon } from "./icons";
import { ReservationIcon } from "./reservation-icon";
import { type Anchor, FormPopover } from "./form-popover";
import { useIsActiveTripTab } from "./trip-detail-tabs";
import { useMediaQuery } from "./use-media-query";
import { type PcDragRender, WeekCalendar } from "./week-calendar";
import {
  MOBILE_TAB_BOTTOM_OFFSET,
  MOBILE_TAB_TOP_OFFSET,
} from "@/lib/mobileTabChrome";

// タブバー化される狭い画面の判定（trip-detail-tabs.tsx の md ブレークポイントと同じ）。
const NARROW_SCREEN_QUERY = "(max-width: 767px)";

export type EventRow = ScheduleEvent & { createdByMemberId: string };

// メール取り込みの未確定予定1件。page.tsx が資料（tzTimeline 等）から事前に
// 組み立てた create モードの EventFormMode をそのまま持つ（確定フォームは
// これをそのまま prefill として使う）。
export type EventDraftItem = {
  id: string;
  labelParts: string[];
  tz: string;
  formState: EventFormMode;
};

type OpenForm = {
  form: EventFormMode;
  anchor: Anchor;
  // 取り込み下書きの確定フローで開いた時だけ持つ。EventForm 成功時にこの
  // 下書きを confirmed にする（resolveInboundDraft）。
  draftId?: string;
};

const DRAFT_ID_PREFIX = "draft:";

// EventDraftItem（メール取り込みの未確定予定）をカレンダー描画用の疑似
// ScheduleEvent に変換する。DB には存在しない表示専用イベント（isDraft）。
function draftToScheduleEvent(
  d: EventDraftItem,
  myMemberId: string,
): EventRow {
  const form = d.formState;
  // eventDrafts は必ず mode:"create" + prefill 付きで組み立てられる（page.tsx）。
  if (form.mode !== "create" || !form.prefill) {
    throw new Error("event draft formState must be create mode with prefill");
  }
  const prefill = form.prefill;
  const kind3 = prefill.kind3;
  const startAt = `${form.date}T${form.time}`;
  const endDate = prefill.endDate ?? form.date;
  const endAt = prefill.endTime ? `${endDate}T${prefill.endTime}` : null;
  return {
    id: `${DRAFT_ID_PREFIX}${d.id}`,
    title: d.labelParts[0],
    kind: kind3 === "transit" ? "transit" : "normal",
    allDay: kind3 === "allday",
    startAt,
    endAt,
    startTz: kind3 === "transit" ? (prefill.departTz ?? form.tz) : null,
    endTz: kind3 === "transit" ? (prefill.arriveTz ?? form.tz) : null,
    tzDisambigTransitId: null,
    tzDisambigSide: null,
    placeId: null,
    visibility: "shared",
    note: null,
    needsReservation: false,
    reservationDone: false,
    participantMemberIds: [], // 空 = 全員のシュガー（不参加によるdimを避ける）
    createdByMemberId: myMemberId,
    isDraft: true,
  };
}

export function ScheduleSection({
  tripId,
  initialTz,
  tripStart,
  tripEnd,
  events,
  eventDrafts,
  places,
  members,
  biasCenter,
  myMemberId,
  afterHeading,
}: {
  tripId: string;
  initialTz: string | null; // trip.default_timezone（旅程にtransitが無い時の唯一の拠り所）
  tripStart: string | null;
  tripEnd: string | null;
  events: EventRow[];
  // メール取り込みの未確定予定。カレンダー上に amber+破線の疑似ブロックとして
  // 描画し、タップで確定フォームを開く（フローティングバナーは廃止）。
  eventDrafts: EventDraftItem[];
  places: { id: string; name: string }[];
  // color は予定ブロック色の決定（1人だけ参加 → その人の hue）に必要。
  members: { id: string; display_name: string; color: number | null }[];
  biasCenter: LatLng; // Google 検索の地理バイアス（既存ピン重心 or 東京）
  myMemberId: string;
  // 広い画面だけに出す取り込みバナー（確認ボタン付き一覧）。狭い画面は
  // カレンダー上の疑似ブロックに一本化する（下記 hidden md:block）。
  afterHeading?: ReactNode;
}) {
  const locale = useLocale();
  const router = useRouter();

  // 予定タブが今表示中か。カレンダー本体は狭い画面で position:fixed の
  // 全画面ブリードにしているが、他タブ表示中（display:none）は document 側の
  // スクロールをロックする理由が無い（費用/TODOタブは通常の縦積みスクロール
  // に依存するため、常時ロックはできない）。予定タブ表示中だけロックする。
  const isActive = useIsActiveTripTab("schedule");
  const isNarrow = useMediaQuery(NARROW_SCREEN_QUERY);
  useEffect(() => {
    if (!isActive || !isNarrow) return;
    const el = document.documentElement;
    const prev = el.style.overflow;
    el.style.overflow = "hidden";
    return () => {
      el.style.overflow = prev;
    };
  }, [isActive, isNarrow]);

  const draftScheduleEvents = useMemo(
    () => eventDrafts.map((d) => draftToScheduleEvent(d, myMemberId)),
    [eventDrafts, myMemberId],
  );
  const eventsWithDrafts = useMemo(
    () => [...events, ...draftScheduleEvents],
    [events, draftScheduleEvents],
  );
  // 予定の色判定で使う、参加者 id → hue の引き辞書。
  const memberHueById = useMemo(
    () => new Map(members.map((m) => [m.id, m.color])),
    [members],
  );
  const [open, setOpen] = useState<OpenForm | null>(null);
  // PC ドラッグで作成中の可変長ゴースト。form 表示中も枠を残したいので
  // ScheduleSection で保持し、closeForm で同期的に消す。
  const [pcDrag, setPcDrag] = useState<PcDragRender | null>(null);

  // 個別TZの初期値: trip.default_timezone → 無ければブラウザのTZ（自宅で
  // 計画する想定。default_timezone はこの旅行で最初の予定/費用を作る瞬間に
  // 一度だけ自動セットされるので、無いのは「まだ何も作っていない」時だけ）。
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
    () =>
      buildSchedule(eventsWithDrafts, {
        tripStart,
        tripEnd,
        locale,
        defaultTimezone: initialTz,
      }),
    [eventsWithDrafts, tripStart, tripEnd, locale, initialTz],
  );

  const tzTimeline = useMemo(
    () => buildTripTzTimeline(events, initialTz),
    [events, initialTz],
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
      if (eventId.startsWith(DRAFT_ID_PREFIX)) {
        const draftId = eventId.slice(DRAFT_ID_PREFIX.length);
        const d = eventDrafts.find((x) => x.id === draftId);
        if (!d) return;
        setOpen({ form: d.formState, anchor, draftId: d.id });
        return;
      }
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
    [events, eventDrafts, myMemberId],
  );

  // 取り込み下書きの確定。EventForm 成功時に呼ばれ、下書きを confirmed に
  // する（ImportDraftRow と同じ resolveInboundDraft）。
  const confirmDraft = useCallback(
    async (draftId: string, eventId?: string) => {
      const supabase = createClient();
      await resolveInboundDraft(supabase, draftId, "confirmed", { eventId });
      router.refresh();
    },
    [router],
  );

  const t = useTranslations("schedule");
  const tImport = useTranslations("import");
  const selectedEventId =
    open?.form.mode === "edit"
      ? open.form.event.id
      : open?.draftId
        ? `${DRAFT_ID_PREFIX}${open.draftId}`
        : null;

  // 予約マーカーの凡例。予約のある予定が1件でもある時だけ出す。
  const hasReservation = events.some((e) => e.needsReservation);

  return (
    // space-y-4 は md: のみ。狭い画面の子要素(取り込みバナー・カレンダー・FAB)は
    // 全て position:fixed で画面基準に配置するため、Tailwind の space-y が
    // 兄弟要素に margin-top を付けると fixed の top/bottom オフセットとズレる。
    <div className="md:space-y-4">
      {/* 広い画面のみの見出し行。狭い画面（タブ化）はカレンダーを画面端まで
          広げるためこの行自体を無くし、+ はフローティングボタンに逃がす
          （下の fixed ボタン群）。*/}
      <div className="hidden items-center justify-between gap-2 md:flex">
        <h2 className="text-lg font-semibold">{t("heading")}</h2>
        <div className="flex items-center gap-3">
          <HelpTip label={t("addHelpLabel")} align="right" widthClass="w-52">
            {t("addHelp")}
          </HelpTip>
          <Button
            type="button"
            size="icon"
            onClick={openCreate}
            aria-label={t("addAria")}
            title={t("addAria")}
          >
            <PlusIcon size={18} />
          </Button>
        </div>
      </div>

      {/* 取り込みバナー（確認ボタン付き一覧）は広い画面だけ。狭い画面は
          未確定の予定をカレンダー上に amber+破線の疑似ブロックで直接表示する
          方式に一本化した（フローティングカードは邪魔が大きすぎたため廃止）。 */}
      {afterHeading && <div className="hidden md:block">{afterHeading}</div>}

      {/* カレンダー本体を直接 position:fixed で画面いっぱいに描く（狭い画面）。
          h-full の多段継承は地図で実機不具合を起こしたため使わず、この1階層の
          ラッパーだけで完結させる（lib/mobileTabChrome.ts）。広い画面は static
          に戻り元通りページ内の1コンポーネント。 */}
      <div
        className="fixed inset-x-0 md:static md:inset-auto"
        style={{ top: MOBILE_TAB_TOP_OFFSET, bottom: MOBILE_TAB_BOTTOM_OFFSET }}
      >
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
          className="h-full max-h-none rounded-none border-x-0 md:h-auto md:max-h-[70vh] md:rounded-md md:border-x"
        />
      </div>

      {/* 狭い画面だけのフローティング操作（Google カレンダー風の FAB）。 */}
      <div
        className="fixed right-4 z-20 flex flex-col items-end gap-2 md:hidden"
        style={{ bottom: `calc(${MOBILE_TAB_BOTTOM_OFFSET} + 16px)` }}
      >
        <HelpTip label={t("addHelpLabel")} align="right" widthClass="w-52">
          {t("addHelp")}
        </HelpTip>
        <Button
          type="button"
          size="icon"
          onClick={openCreate}
          aria-label={t("addAria")}
          title={t("addAria")}
          className="h-12 w-12 rounded-full shadow-lg"
        >
          <PlusIcon size={20} />
        </Button>
      </div>

      {/* 狭い画面はカレンダーが fixed で画面を覆うため、この凡例は隠れて見えなく
          なる（下に隠れた不可視コンテンツを残さないよう非表示にする）。 */}
      {hasReservation && (
        <div className="hidden items-center gap-4 text-xs text-muted-foreground md:flex">
          <span className="inline-flex items-center gap-1">
            <ReservationIcon size={12} />
            {t("needsReservation")}
          </span>
          <span className="inline-flex items-center gap-1">
            <CheckIcon size={12} className="text-subtle-foreground" />
            {t("reserved")}
          </span>
        </div>
      )}

      {open && (
        <FormPopover
          anchor={open.anchor}
          onClose={closeForm}
          label={open.draftId ? tImport("confirmFormLabel") : t("eventFormLabel")}
          fullScreenOnNarrow
          // ボトムシート時の下書き保持キー。取り込み下書きの確定は
          // ImportDraftRow と同じ形式（draftId ごと）、編集は予定ごと、新規は
          // タップしたスロット（日付・時刻・種別）ごとに別の下書きにする。
          draftKey={
            open.draftId
              ? `event:import:${open.draftId}`
              : open.form.mode === "edit"
                ? `event:edit:${open.form.event.id}`
                : `event:new:${tripId}:${open.form.date}:${open.form.time}:${
                    open.form.allDay ? "allday" : "timed"
                  }:${open.form.endTime ?? ""}`
          }
        >
          <EventForm
            tripId={tripId}
            defaultTz={defaultTz}
            tripStart={tripStart}
            tripEnd={tripEnd}
            state={open.form}
            places={places}
            members={members}
            biasCenter={biasCenter}
            tzTimeline={tzTimeline}
            onDone={closeForm}
            onSuccess={
              open.draftId
                ? (eventId) => void confirmDraft(open.draftId!, eventId)
                : undefined
            }
          />
        </FormPopover>
      )}
    </div>
  );
}
