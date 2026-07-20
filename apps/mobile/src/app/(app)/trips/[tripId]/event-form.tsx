import { router, useLocalSearchParams } from "expo-router";
import { Alert, ScrollView } from "react-native";
import { useLocale, useTranslations } from "use-intl";

import { resolveInboundDraft } from "@triplot/shared/data/inbox";
import {
  deriveEventDraftItems,
} from "@triplot/shared/import/drafts";
import { buildTripTzTimeline } from "@triplot/shared/schedule";
import { deriveScheduleEvents } from "@triplot/shared/tripDerive";

import { EventForm } from "@/components/event-form";
import { supabase } from "@/lib/supabase";
import {
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
  const { eventId, draftId, date, time } = useLocalSearchParams<{
    eventId?: string;
    draftId?: string;
    date?: string;
    time?: string;
  }>();
  const locale = useLocale();
  const t = useTranslations();
  const { data, me } = useTripDetail(tripId);
  const { data: tripDrafts } = useTripDrafts(tripId);
  const invalidate = useInvalidateTrip(tripId);

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

  const editEvent = eventId
    ? events.find((e) => e.id === eventId)
    : undefined;
  const confirmingDraft = draftId
    ? eventDrafts.find((d) => d.id === draftId)
    : undefined;
  const slot = date && time ? { date, time } : undefined;

  // 取り込み下書きの確定。EventForm 成功時に呼ばれ、下書きを confirmed に
  // する（web の ScheduleSection と同じ resolveInboundDraft）。
  const confirmDraft = async (id: string, newEventId?: string) => {
    const r = await resolveInboundDraft(supabase, id, "confirmed", {
      eventId: newEventId,
    });
    if (!r.ok) Alert.alert(r.error);
    void invalidate();
  };

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
    >
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
        editEvent={editEvent}
        draft={confirmingDraft}
        slot={slot}
        onDone={() => {
          router.back();
          void invalidate();
        }}
        onSuccess={
          confirmingDraft
            ? (newEventId) => void confirmDraft(confirmingDraft.id, newEventId)
            : undefined
        }
      />
    </ScrollView>
  );
}
