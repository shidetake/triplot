import { useLocale } from "use-intl";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { buildSchedule } from "@triplot/shared/schedule";
import {
  deriveScheduleEvents,
  type EventRow,
} from "@triplot/shared/tripDerive";

import { EventForm } from "@/components/event-form";
import { FormSheet, type FormSheetRef } from "@/components/form-sheet";
import { PlusIcon } from "@/components/icons";
import { WeekCalendar } from "@/components/week-calendar";
import { useInvalidateTrip, useTripDetail } from "@/lib/useTripDetail";
import { useTripId } from "@/lib/useTripId";

// 予定タブ（週カレンダー）。レイアウト計算は shared の buildSchedule、描画は
// WeekCalendar（RN）。予定の追加/編集はボトムシートの EventForm。
export default function ScheduleTab() {
  const tripId = useTripId();
  const locale = useLocale();
  const { data, me } = useTripDetail(tripId);
  const invalidate = useInvalidateTrip(tripId);

  const formRef = useRef<FormSheetRef>(null);
  const [editing, setEditing] = useState<EventRow | null>(null);

  // React Compiler が自動でメモ化するので手動 useMemo は不要。
  const events = data
    ? deriveScheduleEvents(data.eventsRaw, data.todosRaw)
    : [];
  const schedule = data?.trip
    ? buildSchedule(events, {
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
    formRef.current?.present();
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
          events={events}
          memberHueById={memberHueById}
          activeMemberCount={activeMemberCount}
          myMemberId={me.id}
          onEventPress={(ev) => openForm(ev)}
        />
      )}

      {/* 追加 FAB */}
      <Pressable
        onPress={() => openForm(null)}
        style={styles.fab}
        accessibilityLabel="予定を追加"
      >
        <PlusIcon size={24} color="#fff" />
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
            onDone={() => {
              dismiss();
              void invalidate();
            }}
          />
        )}
      </FormSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyText: {
    fontSize: 14,
    color: "rgba(0,0,0,0.6)",
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
    backgroundColor: "#09090b",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
