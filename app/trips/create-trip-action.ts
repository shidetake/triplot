"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  mapTripDays,
  remapEventDate,
  tripDayCount,
} from "@/lib/tripCopy";

type Currency = "JPY" | "USD";

export type CreateTripState = { error: string | null };

export async function createTripAction(
  _prev: CreateTripState,
  formData: FormData,
): Promise<CreateTripState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "ログインが必要です" };
  }

  const title = String(formData.get("title") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const currency = String(
    formData.get("default_currency") ?? "JPY",
  ) as Currency;
  const sourceTripId = String(formData.get("source_trip_id") ?? "").trim();

  if (!title || !startDate || !endDate || !displayName) {
    return { error: "全ての項目を入力してください" };
  }

  // ── ゼロから新規 ──
  if (!sourceTripId) {
    const { data: tripId, error } = await supabase.rpc("create_trip", {
      p_title: title,
      p_start_date: startDate,
      p_end_date: endDate,
      p_default_currency: currency,
      p_display_name: displayName,
    });
    if (error || !tripId) {
      return { error: error?.message ?? "作成に失敗しました" };
    }
    revalidatePath("/");
    redirect(`/trips/${tripId}`);
  }

  // ── 過去の旅行をコピー ──
  // コピー元の日程を取得（日付リマップの基準）。
  const { data: src, error: srcErr } = await supabase
    .from("trips")
    .select("start_date, end_date")
    .eq("id", sourceTripId)
    .single();
  if (srcErr || !src || !src.start_date || !src.end_date) {
    return { error: "コピー元の旅行が見つかりません" };
  }

  // shared かつ「全員参加」（participants 無し）の予定だけを対象に。
  const { data: rawEvents } = await supabase
    .from("events")
    .select(
      "title, kind, all_day, start_at, end_at, start_tz, end_tz, place_id, visibility, note, event_participants(member_id)",
    )
    .eq("trip_id", sourceTripId);

  const shared = (rawEvents ?? []).filter(
    (e) =>
      e.visibility === "shared" && (e.event_participants?.length ?? 0) === 0,
  );

  // 新旅行の日程へ日付をリマップ（両端優先・真ん中潰し）。
  const srcDays = tripDayCount(src.start_date, src.end_date);
  const newDays = tripDayCount(startDate, endDate);
  const dayMap = mapTripDays(srcDays, newDays);

  const events: {
    title: string;
    kind: string;
    all_day: boolean;
    start_at: string;
    end_at: string | null;
    start_tz: string;
    end_tz: string | null;
    place_id: string | null;
    note: string | null;
  }[] = [];
  let dropped = 0;
  for (const e of shared) {
    const r = remapEventDate(
      { startAt: e.start_at, endAt: e.end_at },
      src.start_date,
      startDate,
      dayMap,
    );
    if (!r) {
      dropped += 1;
      continue;
    }
    events.push({
      title: e.title,
      kind: e.kind,
      all_day: e.all_day,
      start_at: r.startAt,
      end_at: r.endAt,
      start_tz: e.start_tz,
      end_tz: e.end_tz,
      place_id: e.place_id,
      note: e.note,
    });
  }

  const { data: tripId, error } = await supabase.rpc("copy_trip", {
    p_source_trip_id: sourceTripId,
    p_title: title,
    p_start_date: startDate,
    p_end_date: endDate,
    p_default_currency: currency,
    p_display_name: displayName,
    p_events: events,
  });
  if (error || !tripId) {
    return { error: error?.message ?? "コピーに失敗しました" };
  }

  revalidatePath("/");
  redirect(
    dropped > 0
      ? `/trips/${tripId}?copiedDropped=${dropped}`
      : `/trips/${tripId}`,
  );
}
