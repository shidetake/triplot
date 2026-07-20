import { router } from "expo-router";
import { useLocale, useTranslations } from "use-intl";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  deriveEventDraftItems,
  draftIdFromEventId,
  draftToScheduleEvent,
} from "@triplot/shared/import/drafts";
import { buildSchedule, buildTripTzTimeline } from "@triplot/shared/schedule";
import {
  deriveScheduleEvents,
  type EventRow,
} from "@triplot/shared/tripDerive";

import { PlusIcon } from "@/components/icons";
import { WeekCalendar } from "@/components/week-calendar";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
import { useTripDetail, useTripDrafts } from "@/lib/useTripDetail";
import { useTripId } from "@/lib/useTripId";

// 予定タブ（週カレンダー）。レイアウト計算は shared の buildSchedule、描画は
// WeekCalendar（RN）。予定の追加/編集は native formSheet ルート
// （trips/[tripId]/event-form）へ router.push で開く。
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

  const memberHueById = new Map(
    (data.members ?? []).map((m) => [m.id, m.color]),
  );
  const activeMemberCount = (data.members ?? []).length;

  // 空き枠長押し→ゴーストをドラッグ→離した日時を開始時刻に事前入力して
  // 追加フォーム（web と同じ UX。ゴースト自体は WeekCalendar が持つ）。
  const onSlotPick = (date: string, minutes: number) => {
    const h = String(Math.floor(minutes / 60)).padStart(2, "0");
    const m = String(minutes % 60).padStart(2, "0");
    router.push(`/trips/${tripId}/event-form?date=${date}&time=${h}:${m}`);
  };

  const onEventPress = (ev: EventRow) => {
    const draftId = draftIdFromEventId(ev.id);
    if (draftId) {
      router.push(`/trips/${tripId}/event-form?draftId=${draftId}`);
      return;
    }
    router.push(`/trips/${tripId}/event-form?eventId=${ev.id}`);
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
          onSlotPick={onSlotPick}
        />
      )}

      {/* 追加 FAB */}
      <Pressable
        onPress={() => router.push(`/trips/${tripId}/event-form`)}
        style={styles.fab}
        accessibilityLabel="予定を追加"
      >
        <PlusIcon size={24} color={theme.primaryForeground} />
      </Pressable>
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
    // NativeTabs（iOS 26 Liquid Glass の浮島タブバー）は RN の zIndex より
    // 上のネイティブ合成レイヤーに乗るため、bottom:28 だと FAB が丸ごと
    // タブバーのヒット領域に隠れてタップが奪われる（実機/シミュレータで
    // 確認・タブバー上端は画面下端から実測 約83pt）。タブバーより確実に
    // 上に出す値へ引き上げる。
    bottom: 100,
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
