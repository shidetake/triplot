"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { generateInviteToken } from "@/lib/invite";
import { createClient } from "@/lib/supabase/server";
import type { Currency, Visibility } from "@/lib/types/database";

export type CreateExpenseState = {
  error: string | null;
  ok: boolean;
};

export async function createExpenseAction(
  tripId: string,
  _prevState: CreateExpenseState,
  formData: FormData,
): Promise<CreateExpenseState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "ログインしてください" };
  }

  const localPriceRaw = (formData.get("local_price") as string | null) ?? "";
  const localPrice = Number.parseFloat(localPriceRaw);
  const localCurrency = formData.get("local_currency") as Currency | null;
  const rateRaw = (formData.get("rate_to_default") as string | null) ?? "";
  const rateToDefault = Number.parseFloat(rateRaw);
  const categoryId = (formData.get("category_id") as string | null) ?? "";
  const payerMemberId =
    (formData.get("payer_member_id") as string | null) ?? "";
  const visibility =
    (formData.get("visibility") as Visibility | null) ?? "shared";
  const splittable =
    visibility === "shared" && formData.get("splittable") === "on";
  const note = ((formData.get("note") as string | null) ?? "").trim();
  // 日付 + 時刻を結合して "YYYY-MM-DDTHH:MM:00" にする（タイムゾーン
  // 指定なし）。Supabase の session TZ は UTC なので、この文字列は UTC
  // 壁時計として保存され、読み戻しても同じ wall clock が得られる。
  const dateRaw = (formData.get("paid_at_date") as string | null) ?? "";
  const timeRaw = (formData.get("paid_at_time") as string | null) ?? "";
  const paidAt =
    dateRaw && timeRaw
      ? `${dateRaw}T${timeRaw}:00`
      : new Date().toISOString();
  // 費用の現地TZ（フォームが旅程推測 / 乗継日選択で決めた IANA）。
  const tz = ((formData.get("tz") as string | null) ?? "").trim();

  const splitMemberIds = formData.getAll("split_member_ids").map(String);

  if (!Number.isFinite(localPrice) || localPrice <= 0) {
    return { ok: false, error: "金額は正の数で入力してください" };
  }
  if (!localCurrency || !["JPY", "USD"].includes(localCurrency)) {
    return { ok: false, error: "通貨を選んでください" };
  }
  if (!Number.isFinite(rateToDefault) || rateToDefault <= 0) {
    return { ok: false, error: "為替レートは正の数で入力してください" };
  }
  if (!categoryId) {
    return { ok: false, error: "カテゴリを選んでください" };
  }
  if (!payerMemberId) {
    return { ok: false, error: "支払った人を選んでください" };
  }
  if (splittable && splitMemberIds.length === 0) {
    return { ok: false, error: "割り勘対象を1人以上選んでください" };
  }

  const place = parsePlace(formData);
  if ("error" in place) {
    return { ok: false, error: place.error };
  }

  // 費用に共通の引数。場所は events と同じ 3 分岐でサーバ側 place_id 解決。
  const base = {
    p_trip_id: tripId,
    p_local_price: localPrice,
    p_local_currency: localCurrency,
    p_rate_to_default: rateToDefault,
    p_category_id: categoryId,
    p_payer_member_id: payerMemberId,
    p_visibility: visibility,
    p_splittable: splittable,
    p_note: note, // 空文字は DB 側 nullif で NULL になる
    p_paid_at: paidAt,
    p_split_member_ids: splittable ? splitMemberIds : [],
    p_tz: tz,
  };

  let error: { message: string } | null = null;
  if (place.kind === "google") {
    error = (
      await supabase.rpc("create_expense_with_place", {
        ...base,
        p_google_place_id: place.placeId,
        p_place_name: place.name,
        p_lat: place.lat,
        p_lng: place.lng,
        p_formatted_address: place.address,
        p_icon: "",
        // gen-types は nullable 引数を string にする癖。空文字は DB 側 nullif で NULL。
        p_region: place.region ?? "",
        p_locality: place.locality ?? "",
      })
    ).error;
  } else if (place.kind === "free" && place.label) {
    error = (
      await supabase.rpc("create_expense_with_freetext_place", {
        ...base,
        p_place_name: place.label,
      })
    ).error;
  } else {
    // 保存済み、または場所なし（自由入力が空 / saved が null）
    error = (
      await supabase.rpc("create_expense", {
        ...base,
        p_place_id: (place.kind === "saved"
          ? place.placeId
          : null) as unknown as string,
      })
    ).error;
  }

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/trips/${tripId}`);
  return { ok: true, error: null };
}

// 既存費用の編集。createExpenseAction とほぼ同じ場所解決の 3 分岐を辿る。
export async function updateExpenseAction(
  tripId: string,
  expenseId: string,
  _prevState: CreateExpenseState,
  formData: FormData,
): Promise<CreateExpenseState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "ログインしてください" };
  }

  const localPriceRaw = (formData.get("local_price") as string | null) ?? "";
  const localPrice = Number.parseFloat(localPriceRaw);
  const localCurrency = formData.get("local_currency") as Currency | null;
  const rateRaw = (formData.get("rate_to_default") as string | null) ?? "";
  const rateToDefault = Number.parseFloat(rateRaw);
  const categoryId = (formData.get("category_id") as string | null) ?? "";
  const payerMemberId =
    (formData.get("payer_member_id") as string | null) ?? "";
  const visibility =
    (formData.get("visibility") as Visibility | null) ?? "shared";
  const splittable =
    visibility === "shared" && formData.get("splittable") === "on";
  const note = ((formData.get("note") as string | null) ?? "").trim();
  // create と同じく日付+時刻を結合（TZ 付けず wall clock として送る）。
  const dateRaw = (formData.get("paid_at_date") as string | null) ?? "";
  const timeRaw = (formData.get("paid_at_time") as string | null) ?? "";
  const paidAt =
    dateRaw && timeRaw
      ? `${dateRaw}T${timeRaw}:00`
      : new Date().toISOString();
  // 費用の現地TZ（フォームが旅程推測 / 乗継日選択で決めた IANA）。
  const tz = ((formData.get("tz") as string | null) ?? "").trim();
  const splitMemberIds = formData.getAll("split_member_ids").map(String);

  if (!Number.isFinite(localPrice) || localPrice <= 0) {
    return { ok: false, error: "金額は正の数で入力してください" };
  }
  if (!localCurrency || !["JPY", "USD"].includes(localCurrency)) {
    return { ok: false, error: "通貨を選んでください" };
  }
  if (!Number.isFinite(rateToDefault) || rateToDefault <= 0) {
    return { ok: false, error: "為替レートは正の数で入力してください" };
  }
  if (!categoryId) {
    return { ok: false, error: "カテゴリを選んでください" };
  }
  if (!payerMemberId) {
    return { ok: false, error: "支払った人を選んでください" };
  }
  if (splittable && splitMemberIds.length === 0) {
    return { ok: false, error: "割り勘対象を1人以上選んでください" };
  }

  const place = parsePlace(formData);
  if ("error" in place) {
    return { ok: false, error: place.error };
  }

  const base = {
    p_expense_id: expenseId,
    p_local_price: localPrice,
    p_local_currency: localCurrency,
    p_rate_to_default: rateToDefault,
    p_category_id: categoryId,
    p_payer_member_id: payerMemberId,
    p_visibility: visibility,
    p_splittable: splittable,
    p_note: note,
    p_paid_at: paidAt,
    p_split_member_ids: splittable ? splitMemberIds : [],
    p_tz: tz,
  };

  let error: { message: string } | null = null;
  if (place.kind === "google") {
    error = (
      await supabase.rpc("update_expense_with_place", {
        ...base,
        p_google_place_id: place.placeId,
        p_place_name: place.name,
        p_lat: place.lat,
        p_lng: place.lng,
        p_formatted_address: place.address,
        p_icon: "",
        // gen-types は nullable 引数を string にする癖。空文字は DB 側 nullif で NULL。
        p_region: place.region ?? "",
        p_locality: place.locality ?? "",
      })
    ).error;
  } else if (place.kind === "free" && place.label) {
    error = (
      await supabase.rpc("update_expense_with_freetext_place", {
        ...base,
        p_place_name: place.label,
      })
    ).error;
  } else {
    error = (
      await supabase.rpc("update_expense", {
        ...base,
        p_place_id: (place.kind === "saved"
          ? place.placeId
          : null) as unknown as string,
      })
    ).error;
  }

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/trips/${tripId}`);
  return { ok: true, error: null };
}

export async function deleteExpenseAction(
  tripId: string,
  expenseId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "ログインしてください" };
  }

  const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/trips/${tripId}`);
  return { error: null };
}

export type PlaceMutationState = {
  error: string | null;
  ok: boolean;
};

export async function createPlaceAction(
  tripId: string,
  _prevState: PlaceMutationState,
  formData: FormData,
): Promise<PlaceMutationState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "ログインしてください" };
  }

  const name = ((formData.get("name") as string | null) ?? "").trim();
  const statusId = (formData.get("status_id") as string | null) ?? "";
  const visibility =
    (formData.get("visibility") as Visibility | null) ?? "shared";
  const note = ((formData.get("note") as string | null) ?? "").trim();
  const googlePlaceId = (
    (formData.get("google_place_id") as string | null) ?? ""
  ).trim();
  const formattedAddress = (
    (formData.get("formatted_address") as string | null) ?? ""
  ).trim();
  const region = ((formData.get("region") as string | null) ?? "").trim();
  const locality = ((formData.get("locality") as string | null) ?? "").trim();
  const icon = ((formData.get("icon") as string | null) ?? "").trim();

  const parseCoord = (raw: string | null): number | null => {
    const n = Number.parseFloat(raw ?? "");
    return Number.isFinite(n) ? n : null;
  };
  const lat = parseCoord(formData.get("lat") as string | null);
  const lng = parseCoord(formData.get("lng") as string | null);

  // create_place 経由は地図上の点なので name と座標は必須。gpid/住所は
  // 任意（Google 候補なら揃う・地図タップの手動ピンは無し）。
  if (!name || lat == null || lng == null) {
    return { ok: false, error: "場所名と地点を指定してください" };
  }
  if (!statusId) {
    return { ok: false, error: "ステータスを選んでください" };
  }
  if (!["shared", "private"].includes(visibility)) {
    return { ok: false, error: "公開範囲が不正です" };
  }

  const { error } = await supabase.rpc("create_place", {
    p_trip_id: tripId,
    p_name: name,
    p_status_id: statusId,
    p_visibility: visibility,
    p_note: note, // 空文字は DB 側 nullif で NULL になる
    p_google_place_id: googlePlaceId,
    p_lat: lat,
    p_lng: lng,
    p_formatted_address: formattedAddress,
    p_icon: icon, // 空なら DB 側で '📍'
    p_region: region, // 空文字は DB 側 nullif で NULL
    p_locality: locality,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/trips/${tripId}`);
  return { ok: true, error: null };
}

export async function updatePlaceAction(
  tripId: string,
  _prevState: PlaceMutationState,
  formData: FormData,
): Promise<PlaceMutationState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "ログインしてください" };
  }

  const placeId = (formData.get("place_id") as string | null) ?? "";
  const statusId = (formData.get("status_id") as string | null) ?? "";
  const visibility =
    (formData.get("visibility") as Visibility | null) ?? "shared";
  const note = ((formData.get("note") as string | null) ?? "").trim();
  const icon = ((formData.get("icon") as string | null) ?? "").trim();

  if (!placeId) {
    return { ok: false, error: "対象の場所が不明です" };
  }
  if (!statusId) {
    return { ok: false, error: "ステータスを選んでください" };
  }
  if (!["shared", "private"].includes(visibility)) {
    return { ok: false, error: "公開範囲が不正です" };
  }

  const { error } = await supabase.rpc("update_place", {
    p_place_id: placeId,
    p_status_id: statusId,
    p_visibility: visibility,
    p_note: note, // 空文字は DB 側 nullif で NULL になる
    p_icon: icon, // 空なら DB 側で '📍'
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/trips/${tripId}`);
  return { ok: true, error: null };
}

export async function deletePlaceAction(
  tripId: string,
  placeId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "ログインしてください" };
  }

  const { error } = await supabase.from("places").delete().eq("id", placeId);
  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/trips/${tripId}`);
  return { error: null };
}

// 未マップ place に座標を後から設定する（地図でピンを置いて確定）。
export async function setPlaceLocationAction(
  tripId: string,
  placeId: string,
  lat: number,
  lng: number,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "ログインしてください" };
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: "座標が不正です" };
  }

  const { error } = await supabase.rpc("set_place_location", {
    p_place_id: placeId,
    p_lat: lat,
    p_lng: lng,
  });
  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/trips/${tripId}`);
  return { error: null };
}

// ────────────────────────────────────────────────────────────
// events（スケジュール）
// ────────────────────────────────────────────────────────────

export type EventMutationState = {
  error: string | null;
  ok: boolean;
};

type EventKind = "normal" | "transit";

// 場所欄の3モード。saved=保存済み or 無し、free=フリーテキスト、
// google=サジェスト確定（places に確定で作成して紐づける）。
type ParsedPlace =
  | { kind: "saved"; placeId: string | null }
  | { kind: "free"; label: string | null }
  | {
      kind: "google";
      placeId: string;
      name: string;
      address: string;
      lat: number;
      lng: number;
      region: string | null;
      locality: string | null;
    };

// 場所欄（PlacePicker の hidden input）を ParsedPlace に解す。
// 予定・費用で共有する（同じ PlacePicker・同じ wire 契約）。
function parsePlace(formData: FormData): ParsedPlace | { error: string } {
  const get = (k: string) => ((formData.get(k) as string | null) ?? "").trim();
  const placeMode = get("place_mode") || "saved";
  if (placeMode === "google") {
    const gPlaceId = get("g_place_id");
    const gName = get("g_name");
    const gAddress = get("g_address");
    const gLat = Number.parseFloat(get("g_lat"));
    const gLng = Number.parseFloat(get("g_lng"));
    if (
      !gPlaceId ||
      !gName ||
      !gAddress ||
      !Number.isFinite(gLat) ||
      !Number.isFinite(gLng)
    ) {
      return { error: "場所を検索して候補から選んでください" };
    }
    return {
      kind: "google",
      placeId: gPlaceId,
      name: gName,
      address: gAddress,
      lat: gLat,
      lng: gLng,
      region: get("g_region") || null,
      locality: get("g_locality") || null,
    };
  }
  if (placeMode === "free") {
    const label = get("place_label");
    return { kind: "free", label: label === "" ? null : label };
  }
  const placeIdRaw = get("place_id");
  return { kind: "saved", placeId: placeIdRaw === "" ? null : placeIdRaw };
}

type ParsedEvent =
  | { error: string }
  | {
      kind: EventKind;
      allDay: boolean;
      title: string;
      startAt: string;
      endAt: string | null;
      startTz: string;
      endTz: string | null;
      place: ParsedPlace;
      visibility: Visibility;
      note: string;
    };

// <input type="date"> / <input type="time"> は分離して送る。壁時計なので
// ここで素朴に "YYYY-MM-DDTHH:MM:00" へ組むだけ（TZ変換は一切しない）。
function parseEventForm(formData: FormData): ParsedEvent {
  const get = (k: string) => ((formData.get(k) as string | null) ?? "").trim();

  const kind = (get("kind") || "normal") as EventKind;
  if (kind !== "normal" && kind !== "transit") {
    return { error: "種別が不正です" };
  }
  const title = get("title");
  if (!title) return { error: "タイトルを入力してください" };

  const visibility = (get("visibility") || "shared") as Visibility;
  if (visibility !== "shared" && visibility !== "private") {
    return { error: "公開範囲が不正です" };
  }
  const note = get("note");

  const place = parsePlace(formData);
  if ("error" in place) return { error: place.error };

  if (kind === "transit") {
    const departDate = get("depart_date");
    const departTime = get("depart_time");
    const departTz = get("depart_tz");
    const arriveDate = get("arrive_date");
    const arriveTime = get("arrive_time");
    const arriveTz = get("arrive_tz");
    if (!departDate || !departTime || !departTz) {
      return { error: "出発の日時・タイムゾーンを入力してください" };
    }
    if (!arriveDate || !arriveTime || !arriveTz) {
      return { error: "到着の日時・タイムゾーンを入力してください" };
    }
    return {
      kind,
      allDay: false,
      title,
      startAt: `${departDate}T${departTime}:00`,
      endAt: `${arriveDate}T${arriveTime}:00`,
      startTz: departTz,
      endTz: arriveTz,
      place,
      visibility,
      note,
    };
  }

  // normal
  const allDay = formData.get("all_day") === "on";

  if (allDay) {
    // 終日イベントのTZは表示に無関係。旅行TZ概念は廃止したので UTC 固定。
    const startDate = get("start_date");
    const endDate = get("end_date") || startDate;
    if (!startDate) return { error: "日付を入力してください" };
    if (endDate < startDate) {
      return { error: "終了日は開始日以降にしてください" };
    }
    return {
      kind,
      allDay: true,
      title,
      startAt: `${startDate}T00:00:00`,
      endAt: `${endDate}T00:00:00`,
      startTz: "UTC",
      endTz: null,
      place,
      visibility,
      note,
    };
  }

  const tz = get("tz");
  if (!tz) return { error: "タイムゾーンを選んでください" };
  const startDate = get("start_date");
  const startTime = get("start_time");
  const endDate = get("end_date") || startDate;
  const endTime = get("end_time");
  if (!startDate || !startTime) {
    return { error: "開始の日付・時刻を入力してください" };
  }
  if (!endTime) {
    return { error: "終了時刻を入力してください" };
  }
  // TZは跨がない（start_tz と同じ）が、日付は跨いでよい。
  // 同一フォーマットなので文字列比較で日時順を判定できる。
  const startAt = `${startDate}T${startTime}:00`;
  const endAt = `${endDate}T${endTime}:00`;
  if (endAt < startAt) {
    return { error: "終了は開始以降にしてください" };
  }
  return {
    kind,
    allDay: false,
    title,
    startAt,
    endAt,
    startTz: tz,
    endTz: null,
    place,
    visibility,
    note,
  };
}

export async function createEventAction(
  tripId: string,
  _prevState: EventMutationState,
  formData: FormData,
): Promise<EventMutationState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "ログインしてください" };
  }

  const parsed = parseEventForm(formData);
  if ("error" in parsed) {
    return { ok: false, error: parsed.error };
  }

  const place = parsed.place;
  // gen-types は DEFAULT 無し nullable 引数を string にする癖がある（CLAUDE.md）。
  // 場所は kind で 3 分岐: google→確定 place、自由入力→未マップ place、
  // 保存済み/無し→ place_id 直指定。いずれもサーバ側で place_id に解決する。
  let error: { message: string } | null = null;
  if (place.kind === "google") {
    error = (
      await supabase.rpc("create_event_with_place", {
        p_trip_id: tripId,
        p_title: parsed.title,
        p_kind: parsed.kind,
        p_all_day: parsed.allDay,
        p_start_at: parsed.startAt,
        p_end_at: parsed.endAt as unknown as string,
        p_start_tz: parsed.startTz,
        p_end_tz: parsed.endTz as unknown as string,
        p_visibility: parsed.visibility,
        p_note: parsed.note,
        p_google_place_id: place.placeId,
        p_place_name: place.name,
        p_lat: place.lat,
        p_lng: place.lng,
        p_formatted_address: place.address,
        p_icon: "",
        // gen-types は nullable 引数を string にする癖。空文字は DB 側 nullif で NULL。
        p_region: place.region ?? "",
        p_locality: place.locality ?? "",
      })
    ).error;
  } else if (place.kind === "free" && place.label) {
    error = (
      await supabase.rpc("create_event_with_freetext_place", {
        p_trip_id: tripId,
        p_title: parsed.title,
        p_kind: parsed.kind,
        p_all_day: parsed.allDay,
        p_start_at: parsed.startAt,
        p_end_at: parsed.endAt as unknown as string,
        p_start_tz: parsed.startTz,
        p_end_tz: parsed.endTz as unknown as string,
        p_visibility: parsed.visibility,
        p_note: parsed.note,
        p_place_name: place.label,
      })
    ).error;
  } else {
    // 保存済み、または場所なし（自由入力が空 / saved が null）
    error = (
      await supabase.rpc("create_event", {
        p_trip_id: tripId,
        p_title: parsed.title,
        p_kind: parsed.kind,
        p_all_day: parsed.allDay,
        p_start_at: parsed.startAt,
        p_end_at: parsed.endAt as unknown as string,
        p_start_tz: parsed.startTz,
        p_end_tz: parsed.endTz as unknown as string,
        p_place_id: (place.kind === "saved"
          ? place.placeId
          : null) as unknown as string,
        p_visibility: parsed.visibility,
        p_note: parsed.note,
      })
    ).error;
  }

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/trips/${tripId}`);
  return { ok: true, error: null };
}

export async function updateEventAction(
  tripId: string,
  _prevState: EventMutationState,
  formData: FormData,
): Promise<EventMutationState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "ログインしてください" };
  }

  const eventId = ((formData.get("event_id") as string | null) ?? "").trim();
  if (!eventId) {
    return { ok: false, error: "対象のイベントが不明です" };
  }

  const parsed = parseEventForm(formData);
  if ("error" in parsed) {
    return { ok: false, error: parsed.error };
  }

  const place = parsed.place;
  // create と同じ 3 分岐（google / 自由入力 / 保存済み・無し）。
  let error: { message: string } | null = null;
  if (place.kind === "google") {
    error = (
      await supabase.rpc("update_event_with_place", {
        p_event_id: eventId,
        p_title: parsed.title,
        p_kind: parsed.kind,
        p_all_day: parsed.allDay,
        p_start_at: parsed.startAt,
        p_end_at: parsed.endAt as unknown as string,
        p_start_tz: parsed.startTz,
        p_end_tz: parsed.endTz as unknown as string,
        p_visibility: parsed.visibility,
        p_note: parsed.note,
        p_google_place_id: place.placeId,
        p_place_name: place.name,
        p_lat: place.lat,
        p_lng: place.lng,
        p_formatted_address: place.address,
        p_icon: "",
        // gen-types は nullable 引数を string にする癖。空文字は DB 側 nullif で NULL。
        p_region: place.region ?? "",
        p_locality: place.locality ?? "",
      })
    ).error;
  } else if (place.kind === "free" && place.label) {
    error = (
      await supabase.rpc("update_event_with_freetext_place", {
        p_event_id: eventId,
        p_title: parsed.title,
        p_kind: parsed.kind,
        p_all_day: parsed.allDay,
        p_start_at: parsed.startAt,
        p_end_at: parsed.endAt as unknown as string,
        p_start_tz: parsed.startTz,
        p_end_tz: parsed.endTz as unknown as string,
        p_visibility: parsed.visibility,
        p_note: parsed.note,
        p_place_name: place.label,
      })
    ).error;
  } else {
    // 保存済み、または場所なし（自由入力が空 / saved が null）
    error = (
      await supabase.rpc("update_event", {
        p_event_id: eventId,
        p_title: parsed.title,
        p_kind: parsed.kind,
        p_all_day: parsed.allDay,
        p_start_at: parsed.startAt,
        p_end_at: parsed.endAt as unknown as string,
        p_start_tz: parsed.startTz,
        p_end_tz: parsed.endTz as unknown as string,
        p_place_id: (place.kind === "saved"
          ? place.placeId
          : null) as unknown as string,
        p_visibility: parsed.visibility,
        p_note: parsed.note,
      })
    ).error;
  }

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/trips/${tripId}`);
  return { ok: true, error: null };
}

export async function deleteEventAction(
  tripId: string,
  eventId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "ログインしてください" };
  }

  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/trips/${tripId}`);
  return { error: null };
}

// ────────────────────────────────────────────────────────────
// 共有リンク
// ────────────────────────────────────────────────────────────

// 取得 or 初回発行（冪等）。既にあれば既存トークンが返る。
export async function ensureInviteAction(
  tripId: string,
): Promise<{ token: string | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { token: null, error: "ログインしてください" };
  }

  const { data: token, error } = await supabase.rpc("ensure_trip_invite", {
    p_trip_id: tripId,
    p_token: generateInviteToken(),
  });

  if (error || !token) {
    return { token: null, error: error?.message ?? "発行に失敗しました" };
  }
  return { token, error: null };
}

// 再生成（旧リンク即失効）。
export async function regenerateInviteAction(
  tripId: string,
): Promise<{ token: string | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { token: null, error: "ログインしてください" };
  }

  const { data: token, error } = await supabase.rpc("regenerate_trip_invite", {
    p_trip_id: tripId,
    p_token: generateInviteToken(),
  });

  if (error || !token) {
    return { token: null, error: error?.message ?? "再生成に失敗しました" };
  }
  return { token, error: null };
}

// ────────────────────────────────────────────────────────────
// トリップ削除 / メンバー削除
// ────────────────────────────────────────────────────────────

export async function deleteTripAction(
  tripId: string,
): Promise<{ error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "ログインしてください" };
  }

  // RLS（trips_member_delete）でアクティブメンバーのみ削除可。
  // 関連テーブルは on delete cascade。
  const { error } = await supabase.from("trips").delete().eq("id", tripId);
  if (error) {
    return { error: error.message };
  }

  redirect("/");
}

export async function removeMemberAction(
  tripId: string,
  memberId: string,
  isSelf: boolean,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "ログインしてください" };
  }

  const { error } = await supabase.rpc("remove_trip_member", {
    p_member_id: memberId,
  });
  if (error) {
    return { error: error.message };
  }

  // 自分を外したらこの旅行はもう見えない → 一覧へ
  if (isSelf) {
    redirect("/");
  }

  revalidatePath(`/trips/${tripId}`);
  return { error: null };
}
