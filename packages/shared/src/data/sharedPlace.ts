import { buildCopySourceLabels } from "../copySourceLabel";
import type { PlaceCandidate } from "../placesSearch";
import { iconForSharedPlace } from "../sharedPlace";
import type { DB } from "./client";
import { createPlace } from "./places";
import { fetchMyTrips } from "./reads/trips";
import { err, ok, type Result } from "./result";

// Google マップの「共有」→ triplot の共有画面（iOS の拡張機能）が使う読み書き。
// 共有画面は web の /api/shared-place を通してこれを呼ぶ。

export type SharedPlaceTrip = {
  id: string;
  // 同名の旅行を見分けられるラベル（コピー元の選択と同じ規則）。
  label: string;
  // この場所がもう入っている旅行。選ぶと足さずに「もう入っています」と返す。
  alreadyAdded: boolean;
};

// 選べる旅行の一覧（旅行一覧と同じ並び）。
export async function fetchSharedPlaceTrips(
  sb: DB,
  userId: string,
  googlePlaceId: string,
): Promise<Result<SharedPlaceTrip[]>> {
  const { trips, error } = await fetchMyTrips(sb, userId);
  if (error) return err(error.message);
  const labels = buildCopySourceLabels(trips);

  const { data: added, error: addedErr } = await sb
    .from("places")
    .select("trip_id")
    .eq("google_place_id", googlePlaceId)
    .in(
      "trip_id",
      trips.map((t) => t.id),
    );
  if (addedErr) return err(addedErr.message);
  const addedTripIds = new Set((added ?? []).map((p) => p.trip_id));

  return ok(
    trips.map((t) => ({
      id: t.id,
      label: labels.get(t.id) ?? t.title,
      alreadyAdded: addedTripIds.has(t.id),
    })),
  );
}

// 旅行に場所を足す。追加フォームを出さないので、公開範囲は共有・メモ無し、
// アイコンは Google の種類から推測する（iconForSharedPlace）。
// 同じ場所がもう入っていれば足さない（アプリの追加と同じく重複させない）。
export async function addSharedPlace(
  sb: DB,
  tripId: string,
  c: PlaceCandidate,
): Promise<Result<"added" | "exists">> {
  const { data: existing, error: existingErr } = await sb
    .from("places")
    .select("id")
    .eq("trip_id", tripId)
    .eq("google_place_id", c.placeId)
    .limit(1);
  if (existingErr) return err(existingErr.message);
  if (existing && existing.length > 0) return ok("exists");

  const { data: pins, error: pinsErr } = await sb
    .from("trip_pin_options")
    .select("icon")
    .eq("trip_id", tripId);
  if (pinsErr) return err(pinsErr.message);

  const created = await createPlace(sb, tripId, {
    name: c.name,
    tentative: false,
    visibility: "shared",
    note: "",
    googlePlaceId: c.placeId,
    lat: c.lat,
    lng: c.lng,
    formattedAddress: c.formattedAddress,
    icon: iconForSharedPlace(
      c.primaryType,
      (pins ?? []).map((p) => p.icon),
    ),
    region: c.region ?? "",
    locality: c.locality ?? "",
  });
  if (!created.ok) return created;
  return ok("added");
}
