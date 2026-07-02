import type { Visibility } from "../types/database";
import type { DB } from "./client";
import { type PlaceInput, placeRpcArgs } from "./place";
import { err, ok, type Result } from "./result";

// 予定の共通フィールド（parseEventForm の結果がそのまま入る）。場所は PlaceInput。
// kind/日時/参加者の検証は呼び出し側（parseEventForm）。
export type EventFields = {
  kind: string;
  allDay: boolean;
  title: string;
  startAt: string;
  endAt: string | null;
  // transit だけが使う実TZ（出発地・到着地）。normal/allday は常に null
  // （tzDisambig* だけを使う。非曖昧な日はそれも null で自動導出）。
  startTz: string | null;
  endTz: string | null;
  // 乗継当日の選択（どの乗継の出発側/到着側か）。非曖昧な日・normal 予定
  // 以外は null。
  tzDisambigTransitId: string | null;
  tzDisambigSide: "depart" | "arrive" | null;
  visibility: Visibility;
  note: string;
  participantMemberIds: string[];
  place: PlaceInput;
};

function eventBase(f: EventFields) {
  return {
    p_title: f.title,
    p_kind: f.kind,
    p_all_day: f.allDay,
    p_start_at: f.startAt,
    // gen-types は nullable 引数を string にする癖。
    p_end_at: f.endAt as unknown as string,
    p_start_tz: f.startTz as unknown as string,
    p_end_tz: f.endTz as unknown as string,
    p_tz_disambig_transit_id: f.tzDisambigTransitId as unknown as string,
    p_tz_disambig_side: f.tzDisambigSide as unknown as string,
    p_visibility: f.visibility,
    p_note: f.note,
    p_participant_member_ids: f.participantMemberIds,
  };
}

export async function createEvent(
  sb: DB,
  tripId: string,
  f: EventFields,
  needsReservation: boolean,
): Promise<Result<void>> {
  const base = { p_trip_id: tripId, ...eventBase(f) };
  const pr = placeRpcArgs(f.place);
  let eventId: string | null = null;
  let error: { message: string } | null = null;
  if (pr.variant === "google") {
    const { data, error: e } = await sb.rpc("create_event_with_place", {
      ...base,
      ...pr.args,
    });
    eventId = data as string | null;
    error = e;
  } else if (pr.variant === "free") {
    const { data, error: e } = await sb.rpc(
      "create_event_with_freetext_place",
      { ...base, ...pr.args },
    );
    eventId = data as string | null;
    error = e;
  } else {
    const { data, error: e } = await sb.rpc("create_event", {
      ...base,
      ...pr.args,
    });
    eventId = data as string | null;
    error = e;
  }
  if (error) return err(error.message);

  // 要予約なら予約TODOを紐づける（作成直後なので未存在→新規作成）。
  if (needsReservation && eventId) {
    const { error: rErr } = await sb.rpc("set_event_reservation", {
      p_event_id: eventId,
      p_needs: true,
    });
    if (rErr) return err(rErr.message);
  }
  return ok(undefined);
}

export async function updateEvent(
  sb: DB,
  eventId: string,
  f: EventFields,
  needsReservation: boolean,
): Promise<Result<void>> {
  const base = { p_event_id: eventId, ...eventBase(f) };
  const pr = placeRpcArgs(f.place);
  let error: { message: string } | null = null;
  if (pr.variant === "google") {
    error = (
      await sb.rpc("update_event_with_place", { ...base, ...pr.args })
    ).error;
  } else if (pr.variant === "free") {
    error = (
      await sb.rpc("update_event_with_freetext_place", { ...base, ...pr.args })
    ).error;
  } else {
    error = (await sb.rpc("update_event", { ...base, ...pr.args })).error;
  }
  if (error) return err(error.message);

  // 予約TODOの同期（ON→作成 / OFF→解除。編集のたびに反映）。
  const { error: rErr } = await sb.rpc("set_event_reservation", {
    p_event_id: eventId,
    p_needs: needsReservation,
  });
  if (rErr) return err(rErr.message);
  return ok(undefined);
}

export async function deleteEvent(
  sb: DB,
  eventId: string,
): Promise<Result<void>> {
  const { error } = await sb.from("events").delete().eq("id", eventId);
  if (error) return err(error.message);
  return ok(undefined);
}
