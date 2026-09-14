import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "use-intl";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ScreenStack, ScreenStackItem } from "react-native-screens";

import {
  deriveEventDraftItemsWithTimeline,
  draftIdFromEventId,
  draftToScheduleEvent,
} from "@triplot/shared/import/drafts";
import { buildSchedule } from "@triplot/shared/schedule";
import {
  HOUR_PX_MIN,
  minEventMinutes,
} from "@triplot/shared/calendarZoom";
import {
  movedTzDisambig,
  type MovedTiming,
} from "@triplot/shared/calendarMove";
import { moveEvent } from "@triplot/shared/data/events";
import {
  deriveScheduleEvents,
  type EventRow,
} from "@triplot/shared/tripDerive";

import { CheckIcon, PlusIcon } from "@/components/icons";
import { FirstRunTip } from "@/components/first-run-tip";
import { MemberAvatar, type MemberLite } from "@/components/member-avatar";
import { SheetTitle } from "@/components/sheet-title";
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
import { viewerTipSeen, markViewerTipSeen } from "@/lib/viewerTip";

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
  // 誰の年表でカレンダーを描くか（既定は自分。web と同じ）。null は「自分」
  // ＝me が取れるまでの間も自分で描く。
  const [viewerOverride, setViewerOverride] = useState<string | null>(null);
  // 週カレンダーの縮尺（1時間あたりの px）。**重なりの判定に使うので画面側でも
  // 持つ**（カレンダーが持つのは描画のため、ここは組み立てのため）。ピンチが
  // 確定した時だけ更新される。
  const [hourPx, setHourPx] = useState(HOUR_PX_MIN);
  const viewerId = viewerOverride ?? me?.id ?? null;
  // 「誰の時計で見るか」を選ぶシートの開閉。
  const [viewerPickOpen, setViewerPickOpen] = useState(false);
  // 初回の案内を出すか。**条件は状態だけ**（年表が分かれている × この人がまだ
  // 使っていない）なので、あとから開いた人にも同じように出る。トーストで
  // 教えると、分かれた瞬間に画面を見ていた人にしか届かない。
  const [tipSeen, setTipSeen] = useState(true);
  useEffect(() => {
    void viewerTipSeen().then(setTipSeen);
  }, []);
  const dismissTip = () => {
    setTipSeen(true);
    void markViewerTipSeen();
  };

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
  const activeMembers = (data?.members ?? []).filter((m) => m.left_at === null);
  const schedule = data?.trip
    ? buildSchedule(eventsWithDrafts, {
        tripStart: data.trip.start_date,
        tripEnd: data.trip.end_date,
        locale,
        defaultTimezone: data.trip.default_timezone,
        viewerMemberId: viewerId,
        memberIds: activeMembers.map((m) => m.id),
        // **重なりの判定は今の縮尺で行う。** 拡大すると同じ15pxが表す分数が
        // 小さくなり、隙間の空いた予定は2列に分かれなくなる。
        minEventMin: minEventMinutes(hourPx),
      })
    : null;
  const hasDivergence = schedule?.groups.some((g) => g.diverged) ?? false;

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
  const activeMemberCount = activeMembers.length;
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

  const memberLite = (m: (typeof activeMembers)[number]): MemberLite => ({
    id: m.id,
    display_name: m.display_name,
    color: m.color,
    avatarUrl: m.users?.avatar_url ?? null,
  });
  const viewerMember = activeMembers.find((m) => m.id === viewerId);

  return (
    // シートを出すために ScreenStack を入れ子にする（TODO タブ・場所タブと
    // 同じパターン。タブ画面の中から native の formSheet を開く唯一の形）。
    <ScreenStack style={StyleSheet.absoluteFill}>
      <ScreenStackItem
        screenId="schedule-calendar"
        activityState={2}
        style={StyleSheet.absoluteFill}
        headerConfig={{ hidden: true }}
      >
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
              onHourPxChange={setHourPx}
              schedule={schedule}
              // 年表が分かれている旅行でだけ、時刻ガターの頭に切り替えを出す。
              viewer={
                hasDivergence && viewerMember
                  ? {
                      member: memberLite(viewerMember),
                      onPress: () => {
                        setViewerPickOpen(true);
                        dismissTip();
                      },
                      // 案内は角の操作子を包む形で渡す（吹き出しは OS が描く）。
                      tip: (anchor, size) => (
                        <FirstRunTip
                          visible={!tipSeen}
                          text={t("schedule.viewerTip")}
                          onDismiss={dismissTip}
                          anchorWidth={size.width}
                          anchorHeight={size.height}
                        >
                          {anchor}
                        </FirstRunTip>
                      ),
                    }
                  : null
              }
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
      </ScreenStackItem>

      {viewerPickOpen && (
        <ScreenStackItem
          screenId="schedule-viewer"
          activityState={2}
          stackPresentation="formSheet"
          sheetAllowedDetents="fitToContents"
          sheetGrabberVisible
          headerConfig={{ hidden: true }}
          onDismissed={() => setViewerPickOpen(false)}
        >
          <ScrollView contentContainerStyle={styles.sheetScroll}>
            <SheetTitle>{t("schedule.viewerTitle")}</SheetTitle>
            {activeMembers.map((m) => {
              const selected = m.id === viewerId;
              const label =
                m.id === me.id
                  ? t("schedule.viewerSelf", { name: m.display_name })
                  : m.display_name;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => {
                    setViewerOverride(m.id);
                    setViewerPickOpen(false);
                  }}
                  accessibilityLabel={label}
                  style={[
                    styles.viewerRow,
                    selected && styles.viewerRowSelected,
                  ]}
                >
                  <MemberAvatar member={memberLite(m)} size={24} />
                  <Text
                    style={[
                      styles.viewerRowLabel,
                      selected && styles.viewerRowLabelSelected,
                    ]}
                  >
                    {label}
                  </Text>
                  {selected && (
                    <CheckIcon size={16} color={theme.mutedForeground} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </ScreenStackItem>
      )}
    </ScreenStack>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background },
    sheetScroll: { paddingBottom: 24 },
    // 「誰の時計で見るか」の行（TODO の優先度シートと同じ形）。
    viewerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.fgAlpha(0.08),
    },
    viewerRowSelected: { backgroundColor: t.secondary },
    viewerRowLabel: { flex: 1, fontSize: 14, color: t.foreground },
    viewerRowLabelSelected: { fontWeight: "600" },
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
