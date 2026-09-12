import { useLocale, useTranslations } from "use-intl";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  deriveEventDraftItemsWithTimeline,
  draftIdFromEventId,
  draftToScheduleEvent,
} from "@triplot/shared/import/drafts";
import { buildSchedule } from "@triplot/shared/schedule";
import {
  movedTzDisambig,
  type MovedTiming,
} from "@triplot/shared/calendarMove";
import { moveEvent } from "@triplot/shared/data/events";
import {
  deriveScheduleEvents,
  type EventRow,
} from "@triplot/shared/tripDerive";

import { PlusIcon } from "@/components/icons";
import { LoadError } from "@/components/load-error";
import { WeekCalendar } from "@/components/week-calendar";
import { MOBILE_TAB_BAR_TOP } from "@/lib/layout";
import { supabase } from "@/lib/supabase";
import { useUndoable } from "@/lib/undoable";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
import {
  useInvalidateTrip,
  useTripDetail,
  useTripDrafts,
} from "@/lib/useTripDetail";
import { useTripId } from "@/lib/useTripId";
import { pushOnce } from "@/lib/navigate";

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
  const { data, me, loadError, refetch, isRefetching } = useTripDetail(tripId);
  const invalidateTrip = useInvalidateTrip(tripId);
  const runUndoable = useUndoable(invalidateTrip);
  const { data: tripDrafts } = useTripDrafts(tripId);

  // React Compiler が自動でメモ化するので手動 useMemo は不要。
  const events = data
    ? deriveScheduleEvents(data.eventsRaw, data.todosRaw)
    : [];
  // 未確定の移動も含めた年表で導出する（deriveEventDraftItemsWithTimeline の
  // コメント参照）。確定した予定だけの年表だと、TZ の境界がまだ仮予定の
  // フライトの時にカレンダーの列と食い違い、ハワイの仮予定が東京の列に並ぶ。
  const { items: eventDrafts } = deriveEventDraftItemsWithTimeline(
    tripDrafts ?? null,
    events,
    data?.trip?.default_timezone ?? null,
    {
      places: (data?.placesRaw ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        formattedAddress: p.formatted_address,
      })),
      locale,
      untitledLabel: t("common.untitledEvent"),
      reservationRefLabel: (ref) => t("tripDetail.reservationRefNote", { ref }),
      // 下書きは転送した本人のもの＝自分の年表で導出する。
      myMemberId: me?.id ?? null,
    },
  );
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

  if (loadError) {
    return (
      <LoadError
        error={loadError}
        onRetry={refetch}
        isRetrying={isRefetching}
      />
    );
  }
  if (!data?.trip || !me || !schedule) return null;

  const memberHueById = new Map(
    (data.members ?? []).map((m) => [m.id, m.color]),
  );
  const activeMemberCount = (data.members ?? []).filter(
    (m) => m.left_at === null,
  ).length;
  // ブロックに場所名を出す（web の schedule-section.placeName と同じ解決）。
  const placeNameById = new Map(
    (data.placesRaw ?? []).map((p) => [p.id, p.name]),
  );
  const placeName = (placeId: string | null) =>
    placeId ? (placeNameById.get(placeId) ?? null) : null;

  // 空き枠長押し→ゴーストをドラッグ→離した日時を開始時刻に事前入力して
  // 追加フォーム（web と同じ UX。ゴースト自体は WeekCalendar が持つ）。
  const onSlotPick = (date: string, minutes: number) => {
    const h = String(Math.floor(minutes / 60)).padStart(2, "0");
    const m = String(minutes % 60).padStart(2, "0");
    pushOnce(`/trips/${tripId}/event-form?date=${date}&time=${h}:${m}`);
  };

  // 終日帯の長押し→離した日付で終日予定を追加（web と同じ経路。時刻は持たない）。
  const onAllDaySlotPick = (date: string) => {
    pushOnce(`/trips/${tripId}/event-form?date=${date}&allDay=1`);
  };

  // 長押し＋ドラッグで動かした予定を保存する。
  //
  // **確認は挟まず、済ませてから戻せるようにする**（ui-guidelines「確認の要否は
  // 復旧コストで決める」）。動かす操作は指を離した瞬間に結果が見えるので、
  // 直前に「本当に動かしますか」と聞いても答えは分かりきっている。代わりに
  // 元の日時をトーストに預けて、押せば戻せるようにする。
  // 長押し＋ドラッグで動かした予定を保存する。
  //
  // **確認は挟まず、済ませてから戻せるようにする**（ui-guidelines「確認の要否は
  // 復旧コストで決める」）。動かした結果は指を離した瞬間に見えるので、直前に
  // 「本当に動かしますか」と聞いても答えは分かりきっている。
  //
  // 戻す側は動かす前の値の書き戻しで、**乗継当日の選択も掴んだ時の値のまま**
  // にする（movedTzDisambig を通すと、日をまたいで戻る時に選択が消えたまま
  // になる。shared/undoable の「逆操作ではなく復元」）。
  const onEventMove = (ev: EventRow, to: MovedTiming) => {
    runUndoable({
      apply: () => moveEvent(supabase, ev.id, to, movedTzDisambig(ev, to)),
      restore: () =>
        moveEvent(
          supabase,
          ev.id,
          { startAt: ev.startAt, endAt: ev.endAt },
          { transitId: ev.tzDisambigTransitId, side: ev.tzDisambigSide },
        ),
      done: t("schedule.moved"),
      failed: (error) => t("schedule.moveFailed", { error }),
    });
  };

  const onEventPress = (ev: EventRow) => {
    const draftId = draftIdFromEventId(ev.id);
    if (draftId) {
      pushOnce(`/trips/${tripId}/event-form?draftId=${draftId}`);
      return;
    }
    pushOnce(`/trips/${tripId}/event-form?eventId=${ev.id}`);
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
          placeName={placeName}
          onEventPress={onEventPress}
          onEventMove={onEventMove}
          onSlotPick={onSlotPick}
          onAllDaySlotPick={onAllDaySlotPick}
        />
      )}

      {/* 追加 FAB */}
      <Pressable
        onPress={() => pushOnce(`/trips/${tripId}/event-form`)}
        style={styles.fab}
        accessibilityLabel={t("event.addAria")}
      >
        <PlusIcon size={24} color={theme.primaryForeground} />
      </Pressable>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background },
    empty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
    },
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
      // 確認）。タブバーより確実に上に出す値へ引き上げる。
      bottom: MOBILE_TAB_BAR_TOP + 17,
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
