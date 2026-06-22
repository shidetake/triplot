import { getIcon } from "../placeIcons";
import type { Visibility } from "../types/database";
import type { DB } from "./client";
import { err, ok, type Result } from "./result";

// 地図上の点として場所を作る（create_place 経由。name と座標は必須＝呼び出し側で検証）。
export type CreatePlaceInput = {
  name: string;
  statusId: string;
  visibility: Visibility;
  note: string;
  googlePlaceId: string;
  lat: number;
  lng: number;
  formattedAddress: string;
  icon: string;
  region: string;
  locality: string;
};

export async function createPlace(
  sb: DB,
  tripId: string,
  f: CreatePlaceInput,
): Promise<Result<void>> {
  const { error } = await sb.rpc("create_place", {
    p_trip_id: tripId,
    p_name: f.name,
    p_status_id: f.statusId,
    p_visibility: f.visibility,
    p_note: f.note, // 空文字は DB 側 nullif で NULL
    p_google_place_id: f.googlePlaceId,
    p_lat: f.lat,
    p_lng: f.lng,
    p_formatted_address: f.formattedAddress,
    p_icon: f.icon, // 空なら DB 側で 'pin'
    p_region: f.region, // 空文字は DB 側 nullif で NULL
    p_locality: f.locality,
  });
  if (error) return err(error.message);
  return ok(undefined);
}

export type UpdatePlaceInput = {
  statusId: string;
  visibility: Visibility;
  note: string;
  icon: string;
};

export async function updatePlace(
  sb: DB,
  placeId: string,
  f: UpdatePlaceInput,
): Promise<Result<void>> {
  const { error } = await sb.rpc("update_place", {
    p_place_id: placeId,
    p_status_id: f.statusId,
    p_visibility: f.visibility,
    p_note: f.note, // 空文字は DB 側 nullif で NULL
    p_icon: f.icon, // 空なら DB 側で 'pin'
  });
  if (error) return err(error.message);
  return ok(undefined);
}

export async function deletePlace(
  sb: DB,
  placeId: string,
): Promise<Result<void>> {
  const { error } = await sb.from("places").delete().eq("id", placeId);
  if (error) return err(error.message);
  return ok(undefined);
}

// 場所ピン（trip_pin_options）の削除。"pin"（その他）は常設バケットなので削除不可。
export async function removeTripPinOption(
  sb: DB,
  tripId: string,
  optionId: string,
): Promise<Result<void>> {
  const { data: target, error: lookupErr } = await sb
    .from("trip_pin_options")
    .select("icon")
    .eq("id", optionId)
    .eq("trip_id", tripId)
    .maybeSingle();
  if (lookupErr) return err(lookupErr.message);
  if (target?.icon === "pin") {
    return err("「その他」のピンは削除できません");
  }

  const { error } = await sb
    .from("trip_pin_options")
    .delete()
    .eq("id", optionId)
    .eq("trip_id", tripId);
  if (error) return err(error.message);
  return ok(undefined);
}

// 場所ピンの追加（trip_pin_options に 1 行）。label はカタログ既定値で固定。
export async function addTripPinOption(
  sb: DB,
  tripId: string,
  iconKey: string,
): Promise<Result<void>> {
  const entry = getIcon(iconKey);
  if (!entry) return err("不明なアイコンです");

  // 末尾の sort_order を計算（ラフに max+1。被りは検索性能にだけ影響）。
  const { data: maxRow, error: maxErr } = await sb
    .from("trip_pin_options")
    .select("sort_order")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) return err(maxErr.message);
  const nextSort = (maxRow?.sort_order ?? -1) + 1;

  const { error } = await sb.from("trip_pin_options").insert({
    trip_id: tripId,
    icon: entry.key,
    label: entry.label,
    sort_order: nextSort,
  });
  if (error) {
    // unique 違反 = 既に追加済み。
    if (error.code === "23505") {
      return err("そのアイコンは既に追加済みです");
    }
    return err(error.message);
  }
  return ok(undefined);
}

// 未マップ place に座標を後から設定する（地図でピンを置いて確定）。
export async function setPlaceLocation(
  sb: DB,
  placeId: string,
  lat: number,
  lng: number,
): Promise<Result<void>> {
  const { error } = await sb.rpc("set_place_location", {
    p_place_id: placeId,
    p_lat: lat,
    p_lng: lng,
  });
  if (error) return err(error.message);
  return ok(undefined);
}
