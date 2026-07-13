import { useLocale, useTranslations } from "use-intl";
import { useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { resolveInboundDraft } from "@triplot/shared/data/inbox";
import {
  deriveEventDraftItems,
  draftIdFromEventId,
  draftToScheduleEvent,
  type EventDraftItem,
} from "@triplot/shared/import/drafts";
import { buildSchedule, buildTripTzTimeline } from "@triplot/shared/schedule";
import {
  deriveScheduleEvents,
  type EventRow,
} from "@triplot/shared/tripDerive";

import { EventForm } from "@/components/event-form";
import { FormSheet, type FormSheetRef } from "@/components/form-sheet";
import { PlusIcon } from "@/components/icons";
import { WeekCalendar } from "@/components/week-calendar";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
import {
  useInvalidateTrip,
  useTripDetail,
  useTripDrafts,
} from "@/lib/useTripDetail";
import { useTripId } from "@/lib/useTripId";

// 予定タブ（週カレンダー）。レイアウト計算は shared の buildSchedule、描画は
// WeekCalendar（RN）。予定の追加/編集はボトムシートの EventForm。
// メール取り込みの未確定予定は amber+破線の疑似ブロックとしてカレンダーに直接
// 表示し、タップで事前入力済みの確定フォームを開く（web の狭い画面と同方式）。
export default function ScheduleTab() {
  const tripId = useTripId();
  const locale = useLocale();
  const t = useTranslations();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { data, me } = useTripDetail(tripId);
  const { data: tripDrafts } = useTripDrafts(tripId);
  const invalidate = useInvalidateTrip(tripId);

  const formRef = useRef<FormSheetRef>(null);
  const [editing, setEditing] = useState<EventRow | null>(null);
  // 取り込み下書きの確定フローで開いた時だけ持つ。EventForm 成功時にこの
  // 下書きを confirmed にする（resolveInboundDraft）。
  const [confirmingDraft, setConfirmingDraft] = useState<EventDraftItem | null>(
    null,
  );
  // 空き枠長押しからの事前入力（開始日時）。FAB・編集で開いた時は null。
  const [slot, setSlot] = useState<{ date: string; time: string } | null>(
    null,
  );

  // React Compiler が自動でメモ化するので手動 useMemo は不要。
  const events = data
    ? deriveScheduleEvents(data.eventsRaw, data.todosRaw)
    : [];
  const tzTimeline = buildTripTzTimeline(
    events,
    data?.trip?.default_timezone ?? null,
  );
  const eventDrafts = deriveEventDraftItems(tripDrafts ?? null, {
    tzTimeline,
    places: (data?.placesRaw ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      formattedAddress: p.formatted_address,
    })),
    locale,
    untitledLabel: t("common.untitledEvent"),
    reservationRefLabel: (ref) => t("tripDetail.reservationRefNote", { ref }),
  });
  const eventsWithDrafts = [
    ...events,
    ...eventDrafts.map((d) => draftToScheduleEvent(d, me?.id ?? "")),
  ];
  const schedule = data?.trip
    ? buildSchedule(eventsWithDrafts, {
        tripStart: data.trip.start_date,
        tripEnd: data.trip.end_date,
        locale,
        defaultTimezone: data.trip.default_timezone,
      })
    : null;

  if (!data?.trip || !me || !schedule) return null;
  const trip = data.trip;

  const memberHueById = new Map(
    (data.members ?? []).map((m) => [m.id, m.color]),
  );
  const activeMemberCount = (data.members ?? []).length;

  const openForm = (ev: EventRow | null) => {
    setEditing(ev);
    setConfirmingDraft(null);
    setSlot(null);
    formRef.current?.present();
  };

  // 空き枠長押し → その日時を開始時刻に事前入力して追加フォーム
  // （iOS 標準カレンダーの「長押しで予定作成」）。
  const onSlotLongPress = (date: string, minutes: number) => {
    setEditing(null);
    setConfirmingDraft(null);
    const h = String(Math.floor(minutes / 60)).padStart(2, "0");
    const m = String(minutes % 60).padStart(2, "0");
    setSlot({ date, time: `${h}:${m}` });
    formRef.current?.present();
  };

  const onEventPress = (ev: EventRow) => {
    const draftId = draftIdFromEventId(ev.id);
    if (draftId) {
      const d = eventDrafts.find((x) => x.id === draftId);
      if (!d) return;
      setEditing(null);
      setConfirmingDraft(d);
      formRef.current?.present();
      return;
    }
    openForm(ev);
  };

  // 取り込み下書きの確定。EventForm 成功時に呼ばれ、下書きを confirmed に
  // する（web の ScheduleSection と同じ resolveInboundDraft）。
  const confirmDraft = async (draftId: string, eventId?: string) => {
    const r = await resolveInboundDraft(supabase, draftId, "confirmed", {
      eventId,
    });
    if (!r.ok) Alert.alert(r.error);
    void invalidate();
  };

  return (
    <View style={styles.screen}>
      {schedule.columns.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            この旅行の日付が未設定です。予定を追加すると、その日から
            カレンダーが出ます。
          </Text>
        </View>
      ) : (
        <WeekCalendar
          schedule={schedule}
          events={eventsWithDrafts}
          memberHueById={memberHueById}
          activeMemberCount={activeMemberCount}
          myMemberId={me.id}
          onEventPress={onEventPress}
          onSlotLongPress={onSlotLongPress}
        />
      )}

      {/* 追加 FAB */}
      <Pressable
        onPress={() => openForm(null)}
        style={styles.fab}
        accessibilityLabel="予定を追加"
      >
        <PlusIcon size={24} color={theme.primaryForeground} />
      </Pressable>

      <FormSheet ref={formRef}>
        {(dismiss) => (
          <EventForm
            tripId={tripId}
            members={(data.members ?? []).map((m) => ({
              id: m.id,
              display_name: m.display_name,
              color: m.color,
            }))}
            myMemberId={me.id}
            places={(data.placesRaw ?? []).map((p) => ({
              id: p.id,
              name: p.name,
            }))}
            tripStart={trip.start_date}
            defaultTimezone={trip.default_timezone}
            events={events}
            editEvent={editing ?? undefined}
            draft={confirmingDraft ?? undefined}
            slot={slot ?? undefined}
            onDone={() => {
              dismiss();
              void invalidate();
            }}
            onSuccess={
              confirmingDraft
                ? (eventId) => void confirmDraft(confirmingDraft.id, eventId)
                : undefined
            }
          />
        )}
      </FormSheet>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.background },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyText: {
    fontSize: 14,
    color: t.mutedForeground,
    textAlign: "center",
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 28,
    // カレンダーのネスト ScrollView にタッチを奪われないよう最前面に上げる。
    zIndex: 50,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
