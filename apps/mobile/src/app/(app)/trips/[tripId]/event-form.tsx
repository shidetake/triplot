import { router, useLocalSearchParams } from "expo-router";
import { Alert, ScrollView } from "react-native";
import { useLocale, useTranslations } from "use-intl";

import { resolveInboundDrafts } from "@triplot/shared/data/inbox";
import { deriveEventDraftItems } from "@triplot/shared/import/drafts";
import { dominantCenter } from "@triplot/shared/placeMap";
import { buildTripTzTimeline } from "@triplot/shared/schedule";
import { deriveScheduleEvents } from "@triplot/shared/tripDerive";

import { EventForm } from "@/components/event-form";
import { FormHostProvider } from "@/components/form-host";
import { supabase } from "@/lib/supabase";
import { useSiblingConfirm } from "@/lib/useSiblingConfirm";
import {
  useInvalidateInbox,
  useInvalidateTrip,
  useTripDetail,
  useTripDrafts,
} from "@/lib/useTripDetail";
import { useTripId } from "@/lib/useTripId";

// 予定の追加/編集（native formSheet ルート）。予定タブ（週カレンダー）から
// router.push で開く。eventId=編集対象／draftId=取り込み下書きの確定／
// date・time=空き枠長押しの事前入力（すべて省略なら新規追加）。
export default function EventFormRoute() {
  const tripId = useTripId();
  const { eventId, draftId, date, time, allDay } = useLocalSearchParams<{
    eventId?: string;
    draftId?: string;
    date?: string;
    time?: string;
    allDay?: string;
  }>();
  const locale = useLocale();
  const t = useTranslations();
  const { data, me } = useTripDetail(tripId);
  const { data: tripDrafts } = useTripDrafts(tripId);
  const invalidate = useInvalidateTrip(tripId);
  const invalidateInbox = useInvalidateInbox();

  // フックは早期 return より前で呼ぶ（ガードの後ろに置くと描画ごとに
  // フックの数が変わって落ちる）。
  const { confirmSiblings, dismissSiblings } = useSiblingConfirm(
    tripId,
    me?.id,
  );

  if (!data?.trip || !me) return null;
  const trip = data.trip;

  const events = deriveScheduleEvents(data.eventsRaw, data.todosRaw);
  const tzTimeline = buildTripTzTimeline(events, trip.default_timezone);
  const eventDrafts = deriveEventDraftItems(tripDrafts ?? null, {
    tzTimeline,
    places: (data.placesRaw ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      formattedAddress: p.formatted_address,
    })),
    locale,
    untitledLabel: t("common.untitledEvent"),
    reservationRefLabel: (ref) => t("tripDetail.reservationRefNote", { ref }),
  });

  // 場所欄の Google サジェストの地理バイアス（旅行の既存ピンが集まる主役
  // エリアの中心。無ければ無バイアス＝地図タブと違い Tokyo にはフォールバック
  // しない）。
  const biasCenter =
    dominantCenter(
      (data.placesRaw ?? [])
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => ({ lat: p.lat as number, lng: p.lng as number })),
    ) ?? undefined;

  const editEvent = eventId ? events.find((e) => e.id === eventId) : undefined;
  const confirmingDraft = draftId
    ? eventDrafts.find((d) => d.id === draftId)
    : undefined;
  // 終日帯の長押しは時刻を持たない（日付だけ）。その場合も slot として渡し、
  // 時刻の既定は EventForm 側（09:00）に任せる。
  const slot = date
    ? { date, time: time ?? "09:00", allDay: allDay === "1" }
    : undefined;

  // 取り込み下書きの確定。EventForm 成功時に呼ばれ、下書きを confirmed に
  // する（web の ScheduleSection と同じ resolveInboundDraft）。この旅行の
  // 未確定が全部片付くと親メールも DB 側で自動的に確定扱いになるので、受信箱の
  // キャッシュも合わせて無効化する（useInvalidateInbox 参照）。
  // 重なった同一店の下書きは1件にまとめて表示しているので、畳んだぶんも
  // 一緒に解決する（1件だけだと残りが未確定のまま再び現れる）。web の
  // ScheduleSection と同じ。
  const draftIdsOf = (id: string) =>
    eventDrafts.find((d) => d.id === id)?.draftIds ?? [id];

  // 同じメールから出た費用の下書きも一緒に確定する（1通のメールはたいてい
  // 費用と予定の両方を産むので、片方だけ確定すると相方が残る）。web の
  // ScheduleSection と同じ。
  const emailIdsOf = (id: string) =>
    eventDrafts.find((d) => d.id === id)?.emailIds ?? [];

  const confirmDraft = async (id: string, newEventId?: string) => {
    const draftIds = draftIdsOf(id);
    const r = await resolveInboundDrafts(supabase, draftIds, "confirmed", {
      eventId: newEventId,
    });
    if (!r.ok) Alert.alert(r.error);
    await confirmSiblings(emailIdsOf(id), draftIds);
    void invalidate();
    void invalidateInbox();
  };

  // 取り込み下書きの破棄（費用タブの dismissDraft と同じ）。確定と同じく
  // メール単位で、同じメールから出た費用・予定をまとめて破棄する。
  const dismissDraft = (id: string) => {
    Alert.alert(t("import.dismissDraftTitle"), t("import.dismissDraftBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("import.dismiss"),
        style: "destructive",
        onPress: () => {
          void dismissSiblings(emailIdsOf(id)).then(
            (r) => {
              if (!r.ok) {
                Alert.alert(t("import.dismissFailed", { error: r.error }));
                return;
              }
              router.back();
              void invalidate();
              void invalidateInbox();
            },
          );
        },
      },
    ]);
  };

  // 入力途中を保持するキー（web の schedule-section と同じ体系）。取り込み
  // 下書きの確定は下書きごと、編集は予定ごと、新規は開いたスロットごとに別の
  // 下書きにする＝別の予定を開いたら前の入力が混ざらない。
  const draftKey = draftId
    ? `event:import:${draftId}`
    : eventId
      ? `event:edit:${eventId}`
      : `event:new:${tripId}:${date ?? ""}:${time ?? ""}:${
          allDay === "1" ? "allday" : "timed"
        }`;

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <FormHostProvider draftKey={draftKey}>
        <EventForm
          tripId={tripId}
          members={(data.members ?? [])
            .filter((m) => m.left_at === null)
            .map((m) => ({
              id: m.id,
              display_name: m.display_name,
              color: m.color,
            }))}
          myMemberId={me.id}
          places={(data.placesRaw ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            lat: p.lat,
            lng: p.lng,
          }))}
          biasCenter={biasCenter}
          tripStart={trip.start_date}
          defaultTimezone={trip.default_timezone}
          events={events}
          editEvent={editEvent}
          draft={confirmingDraft}
          slot={slot}
          onDone={() => {
            router.back();
            void invalidate();
          }}
          onSuccess={
            confirmingDraft
              ? (newEventId) =>
                  void confirmDraft(confirmingDraft.id, newEventId)
              : undefined
          }
          onDismissDraft={
            confirmingDraft ? () => dismissDraft(confirmingDraft.id) : undefined
          }
        />
      </FormHostProvider>
    </ScrollView>
  );
}
