"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { translateSharedError } from "@/lib/translateSharedError";

import {
  createEvent,
  deleteEvent,
  updateEvent,
} from "@triplot/shared/data/events";
import {
  createExpense,
  deleteExpense,
  updateExpense,
} from "@triplot/shared/data/expenses";
import {
  addTripPinOption,
  createPlace,
  deletePlace,
  removeTripPinOption,
  setPlaceLocation,
  updatePlace,
} from "@triplot/shared/data/places";
import {
  ensureTripInvite,
  regenerateTripInvite,
} from "@triplot/shared/data/invites";
import { type PlaceInput } from "@triplot/shared/data/place";
import {
  removeTripMember,
  updateMyMemberName,
} from "@triplot/shared/data/members";
import {
  createTodo,
  deleteTodo,
  setTodoDone,
  toggleTodoLike,
  updateTodo,
} from "@triplot/shared/data/todos";
import { deleteTrip, updateTrip } from "@triplot/shared/data/trips";
import { createClient } from "@/lib/supabase/server";
import type { Currency, Visibility } from "@triplot/shared/types/database";

export type CreateExpenseState = {
  error: string | null;
  ok: boolean;
};

export type UpdateTripState = { ok: boolean; error: string | null };

// 旅行のタイトル・日程・精算通貨を更新（admin のみ）。権限は RLS（trips_admin_update＝
// is_trip_admin）で担保。非 admin は更新が 0 行になるので .select() の結果で検知してエラーにする。
export async function updateTripAction(
  tripId: string,
  _prevState: UpdateTripState,
  formData: FormData,
): Promise<UpdateTripState> {
  const t = await getTranslations("validation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("loginRequired") };

  const title = String(formData.get("title") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "");
  const currency = String(formData.get("default_currency") ?? "") as Currency;

  if (!title) return { ok: false, error: t("enterTitle") };
  if (!startDate || !endDate) {
    return { ok: false, error: t("enterDates") };
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { ok: false, error: t("invalidCurrency") };
  }

  const tErr = await getTranslations("errors");
  const result = await updateTrip(supabase, tripId, {
    title,
    startDate,
    endDate,
    currency,
  });
  if (!result.ok) return { ok: false, error: translateSharedError(result.error, tErr) };

  revalidatePath(`/trips/${tripId}`);
  return { ok: true, error: null };
}

export async function createExpenseAction(
  tripId: string,
  _prevState: CreateExpenseState,
  formData: FormData,
): Promise<CreateExpenseState> {
  const t = await getTranslations("validation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: t("loginRequired") };
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
  const tzDisambigTransitId =
    ((formData.get("tz_disambig_transit_id") as string | null) ?? "").trim() ||
    null;
  const tzDisambigSideRaw = (
    (formData.get("tz_disambig_side") as string | null) ?? ""
  ).trim();
  const tzDisambigSide =
    tzDisambigSideRaw === "depart" || tzDisambigSideRaw === "arrive"
      ? tzDisambigSideRaw
      : null;

  const splitMemberIds = formData.getAll("split_member_ids").map(String);

  if (!Number.isFinite(localPrice) || localPrice <= 0) {
    return { ok: false, error: t("pricePositive") };
  }
  if (!localCurrency || !/^[A-Z]{3}$/.test(localCurrency)) {
    return { ok: false, error: t("selectCurrency") };
  }
  if (!Number.isFinite(rateToDefault) || rateToDefault <= 0) {
    return { ok: false, error: t("ratePositive") };
  }
  if (!categoryId) {
    return { ok: false, error: t("selectCategory") };
  }
  if (!payerMemberId) {
    return { ok: false, error: t("selectPayer") };
  }
  if (splittable && splitMemberIds.length === 0) {
    return { ok: false, error: t("selectSplitTargets") };
  }

  const place = parsePlace(formData, t);
  if ("error" in place) {
    return { ok: false, error: place.error };
  }

  const result = await createExpense(supabase, tripId, {
    localPrice,
    localCurrency,
    rateToDefault,
    categoryId,
    payerMemberId,
    visibility,
    splittable,
    note,
    paidAt,
    tz,
    tzDisambigTransitId,
    tzDisambigSide,
    splitMemberIds,
    place,
  });
  if (!result.ok) return { ok: false, error: result.error };

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
  const t = await getTranslations("validation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: t("loginRequired") };
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
  const tzDisambigTransitId =
    ((formData.get("tz_disambig_transit_id") as string | null) ?? "").trim() ||
    null;
  const tzDisambigSideRaw = (
    (formData.get("tz_disambig_side") as string | null) ?? ""
  ).trim();
  const tzDisambigSide =
    tzDisambigSideRaw === "depart" || tzDisambigSideRaw === "arrive"
      ? tzDisambigSideRaw
      : null;
  const splitMemberIds = formData.getAll("split_member_ids").map(String);

  if (!Number.isFinite(localPrice) || localPrice <= 0) {
    return { ok: false, error: t("pricePositive") };
  }
  if (!localCurrency || !/^[A-Z]{3}$/.test(localCurrency)) {
    return { ok: false, error: t("selectCurrency") };
  }
  if (!Number.isFinite(rateToDefault) || rateToDefault <= 0) {
    return { ok: false, error: t("ratePositive") };
  }
  if (!categoryId) {
    return { ok: false, error: t("selectCategory") };
  }
  if (!payerMemberId) {
    return { ok: false, error: t("selectPayer") };
  }
  if (splittable && splitMemberIds.length === 0) {
    return { ok: false, error: t("selectSplitTargets") };
  }

  const place = parsePlace(formData, t);
  if ("error" in place) {
    return { ok: false, error: place.error };
  }

  const result = await updateExpense(supabase, expenseId, {
    localPrice,
    localCurrency,
    rateToDefault,
    categoryId,
    payerMemberId,
    visibility,
    splittable,
    note,
    paidAt,
    tz,
    tzDisambigTransitId,
    tzDisambigSide,
    splitMemberIds,
    place,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/trips/${tripId}`);
  return { ok: true, error: null };
}

export async function deleteExpenseAction(
  tripId: string,
  expenseId: string,
): Promise<{ error: string | null }> {
  const t = await getTranslations("validation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: t("loginRequired") };
  }

  const result = await deleteExpense(supabase, expenseId);
  if (!result.ok) return { error: result.error };

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
  const t = await getTranslations("validation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: t("loginRequired") };
  }

  const name = ((formData.get("name") as string | null) ?? "").trim();
  const tentative = (formData.get("tentative") as string | null) !== "false";
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
    return { ok: false, error: t("enterNameAndLocation") };
  }
  if (!["shared", "private"].includes(visibility)) {
    return { ok: false, error: t("invalidVisibility") };
  }

  const result = await createPlace(supabase, tripId, {
    name,
    tentative,
    visibility,
    note,
    googlePlaceId,
    lat,
    lng,
    formattedAddress,
    icon,
    region,
    locality,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/trips/${tripId}`);
  return { ok: true, error: null };
}

export async function updatePlaceAction(
  tripId: string,
  _prevState: PlaceMutationState,
  formData: FormData,
): Promise<PlaceMutationState> {
  const t = await getTranslations("validation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: t("loginRequired") };
  }

  const placeId = (formData.get("place_id") as string | null) ?? "";
  const tentative = (formData.get("tentative") as string | null) !== "false";
  const visibility =
    (formData.get("visibility") as Visibility | null) ?? "shared";
  const note = ((formData.get("note") as string | null) ?? "").trim();
  const icon = ((formData.get("icon") as string | null) ?? "").trim();

  if (!placeId) {
    return { ok: false, error: t("unknownPlace") };
  }
  if (!["shared", "private"].includes(visibility)) {
    return { ok: false, error: t("invalidVisibility") };
  }

  const result = await updatePlace(supabase, placeId, {
    tentative,
    visibility,
    note,
    icon,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/trips/${tripId}`);
  return { ok: true, error: null };
}

export async function deletePlaceAction(
  tripId: string,
  placeId: string,
): Promise<{ error: string | null }> {
  const t = await getTranslations("validation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: t("loginRequired") };
  }

  const result = await deletePlace(supabase, placeId);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/trips/${tripId}`);
  return { error: null };
}

// 場所ピンの削除。既にそのピンを使ってる places.icon は catalog から直接
// glyph を引くので、ピンを外しても各 place の表示は壊れない（picker から
// 候補として出なくなるだけ）。
// "pin"（その他）は常に存在するセーフティバケットなので削除不可で守る。
// UI 側でも picker から非表示にしてるが、サーバ側でも念のため弾く。
export async function removeTripPinOptionAction(
  tripId: string,
  optionId: string,
): Promise<{ error: string | null }> {
  const t = await getTranslations("validation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: t("loginRequired") };
  }

  const tErr = await getTranslations("errors");
  const result = await removeTripPinOption(supabase, tripId, optionId);
  if (!result.ok) return { error: translateSharedError(result.error, tErr) };

  revalidatePath(`/trips/${tripId}`);
  return { error: null };
}

// 場所ピンの追加（trip_pin_options に 1 行 insert）。RLS は active member 限定
// なので RPC は使わず素の table 操作で OK。label はカタログ既定値で固定（将来
// 「ラベル編集 UI」を入れたら別アクションで update）。
export async function addTripPinOptionAction(
  tripId: string,
  iconKey: string,
): Promise<{ error: string | null }> {
  const t = await getTranslations("validation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: t("loginRequired") };
  }

  const tErr = await getTranslations("errors");
  const result = await addTripPinOption(supabase, tripId, iconKey);
  if (!result.ok) return { error: translateSharedError(result.error, tErr) };

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
  const t = await getTranslations("validation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: t("loginRequired") };
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: t("invalidCoordinates") };
  }

  const result = await setPlaceLocation(supabase, placeId, lat, lng);
  if (!result.ok) return { error: result.error };

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

type TFunc = Awaited<ReturnType<typeof getTranslations>>;

// 場所欄（PlacePicker の hidden input）を PlaceInput（共有の場所解決契約）に解す。
// 予定・費用で共有する（同じ PlacePicker・同じ wire 契約）。
function parsePlace(formData: FormData, t: TFunc): PlaceInput | { error: string } {
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
      return { error: t("selectFromSearch") };
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
      // transit のみ非null（唯一の実TZ）。normal/allday は常に null。
      startTz: string | null;
      endTz: string | null;
      // 乗継当日の選択。非曖昧な日・kind='transit'では null。
      tzDisambigTransitId: string | null;
      tzDisambigSide: "depart" | "arrive" | null;
      place: PlaceInput;
      visibility: Visibility;
      note: string;
      // shared 時のみ意味を持つ。空配列 = 全員参加（DB 側で行を作らない）。
      // private 時はサーバ側で空配列に正規化して送る（クライアントは何送っても無視）。
      participantMemberIds: string[];
    };

// <input type="date"> / <input type="time"> は分離して送る。壁時計なので
// ここで素朴に "YYYY-MM-DDTHH:MM:00" へ組むだけ（TZ変換は一切しない）。
function parseEventForm(formData: FormData, t: TFunc): ParsedEvent {
  const get = (k: string) => ((formData.get(k) as string | null) ?? "").trim();

  const kind = (get("kind") || "normal") as EventKind;
  if (kind !== "normal" && kind !== "transit") {
    return { error: t("invalidKind") };
  }
  const title = get("title");
  if (!title) return { error: t("enterTitle") };

  const visibility = (get("visibility") || "shared") as Visibility;
  if (visibility !== "shared" && visibility !== "private") {
    return { error: t("invalidVisibility") };
  }
  const note = get("note");

  // 参加者は <input type="hidden" name="participant_member_ids" value={memberId}> を
  // 複数本生やす方式で送られる。private は無意味なので空に正規化。
  const participantMemberIds =
    visibility === "shared"
      ? formData
          .getAll("participant_member_ids")
          .map(String)
          .filter((s) => s !== "")
      : [];

  const place = parsePlace(formData, t);
  if ("error" in place) return { error: place.error };

  if (kind === "transit") {
    const departDate = get("depart_date");
    const departTime = get("depart_time");
    const departTz = get("depart_tz");
    const arriveDate = get("arrive_date");
    const arriveTime = get("arrive_time");
    const arriveTz = get("arrive_tz");
    if (!departDate || !departTime || !departTz) {
      return { error: t("enterDepartDateTime") };
    }
    if (!arriveDate || !arriveTime || !arriveTz) {
      return { error: t("enterArriveDateTime") };
    }
    return {
      kind,
      allDay: false,
      title,
      startAt: `${departDate}T${departTime}:00`,
      endAt: `${arriveDate}T${arriveTime}:00`,
      startTz: departTz,
      endTz: arriveTz,
      tzDisambigTransitId: null,
      tzDisambigSide: null,
      place,
      visibility,
      note,
      participantMemberIds,
    };
  }

  // normal
  const allDay = formData.get("all_day") === "on";

  if (allDay) {
    // 終日イベントのTZは表示に無関係なので保存しない。
    const startDate = get("start_date");
    const endDate = get("end_date") || startDate;
    if (!startDate) return { error: t("enterDate") };
    if (endDate < startDate) {
      return { error: t("endDateAfterStart") };
    }
    return {
      kind,
      allDay: true,
      title,
      startAt: `${startDate}T00:00:00`,
      endAt: `${endDate}T00:00:00`,
      startTz: null,
      endTz: null,
      tzDisambigTransitId: null,
      tzDisambigSide: null,
      place,
      visibility,
      note,
      participantMemberIds,
    };
  }

  const tz = get("tz");
  if (!tz) return { error: t("selectTimezone") };
  const tzDisambigTransitId = get("tz_disambig_transit_id") || null;
  const tzDisambigSideRaw = get("tz_disambig_side");
  const tzDisambigSide =
    tzDisambigSideRaw === "depart" || tzDisambigSideRaw === "arrive"
      ? tzDisambigSideRaw
      : null;
  const startDate = get("start_date");
  const startTime = get("start_time");
  const endDate = get("end_date") || startDate;
  const endTime = get("end_time");
  if (!startDate || !startTime) {
    return { error: t("enterStartDateTime") };
  }
  if (!endTime) {
    return { error: t("enterEndTime") };
  }
  // TZは跨がない（実効TZは旅程から解決）が、日付は跨いでよい。
  // 同一フォーマットなので文字列比較で日時順を判定できる。
  const startAt = `${startDate}T${startTime}:00`;
  const endAt = `${endDate}T${endTime}:00`;
  if (endAt < startAt) {
    return { error: t("endAfterStart") };
  }
  return {
    kind,
    allDay: false,
    title,
    startAt,
    endAt,
    startTz: null,
    endTz: null,
    tzDisambigTransitId,
    tzDisambigSide,
    place,
    visibility,
    note,
    participantMemberIds,
  };
}

export async function createEventAction(
  tripId: string,
  _prevState: EventMutationState,
  formData: FormData,
): Promise<EventMutationState> {
  const t = await getTranslations("validation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: t("loginRequired") };
  }

  const parsed = parseEventForm(formData, t);
  if ("error" in parsed) {
    return { ok: false, error: parsed.error };
  }

  // 要予約は共有/private どちらでも可。予約TODOは予定の公開範囲を継承する
  // （private 予定の予約TODOは作成者だけに見える。set_event_reservation で同期）。
  const needsReservation = formData.get("needs_reservation") === "on";

  const result = await createEvent(supabase, tripId, parsed, needsReservation);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/trips/${tripId}`);
  return { ok: true, error: null };
}

export async function updateEventAction(
  tripId: string,
  _prevState: EventMutationState,
  formData: FormData,
): Promise<EventMutationState> {
  const t = await getTranslations("validation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: t("loginRequired") };
  }

  const eventId = ((formData.get("event_id") as string | null) ?? "").trim();
  if (!eventId) {
    return { ok: false, error: t("unknownEvent") };
  }

  const parsed = parseEventForm(formData, t);
  if ("error" in parsed) {
    return { ok: false, error: parsed.error };
  }

  // 要予約は共有/private どちらでも可。予約TODOは予定の公開範囲を継承する
  // （private 予定の予約TODOは作成者だけに見える。set_event_reservation で同期）。
  const needsReservation = formData.get("needs_reservation") === "on";

  const result = await updateEvent(supabase, eventId, parsed, needsReservation);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/trips/${tripId}`);
  return { ok: true, error: null };
}

export async function deleteEventAction(
  tripId: string,
  eventId: string,
): Promise<{ error: string | null }> {
  const t = await getTranslations("validation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: t("loginRequired") };
  }

  const result = await deleteEvent(supabase, eventId);
  if (!result.ok) return { error: result.error };

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
  const t = await getTranslations("validation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { token: null, error: t("loginRequired") };
  }

  const tErr = await getTranslations("errors");
  const result = await ensureTripInvite(supabase, tripId);
  if (!result.ok) return { token: null, error: translateSharedError(result.error, tErr) };
  return { token: result.data.token, error: null };
}

// 再生成（旧リンク即失効）。
export async function regenerateInviteAction(
  tripId: string,
): Promise<{ token: string | null; error: string | null }> {
  const t = await getTranslations("validation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { token: null, error: t("loginRequired") };
  }

  const tErr = await getTranslations("errors");
  const result = await regenerateTripInvite(supabase, tripId);
  if (!result.ok) return { token: null, error: translateSharedError(result.error, tErr) };
  return { token: result.data.token, error: null };
}

// ────────────────────────────────────────────────────────────
// トリップ削除 / メンバー削除
// ────────────────────────────────────────────────────────────

export async function deleteTripAction(
  tripId: string,
): Promise<{ error: string }> {
  const t = await getTranslations("validation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: t("loginRequired") };
  }

  const tErr = await getTranslations("errors");
  const result = await deleteTrip(supabase, tripId, user.id);
  if (!result.ok) return { error: translateSharedError(result.error, tErr) };

  redirect("/trips");
}

export async function removeMemberAction(
  tripId: string,
  memberId: string,
  isSelf: boolean,
): Promise<{ error: string | null }> {
  const t = await getTranslations("validation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: t("loginRequired") };
  }

  const result = await removeTripMember(supabase, memberId);
  if (!result.ok) return { error: result.error };

  // 自分を外したらこの旅行はもう見えない → 一覧へ
  if (isSelf) {
    redirect("/trips");
  }

  revalidatePath(`/trips/${tripId}`);
  return { error: null };
}

// 自分の display_name（この旅行内）を変える。RLS の trip_members_self_update
// で自レコードのみ更新可なので RPC は不要。
// 色は参加時に自動割当で決まり、後から変更する UI は持たない方針 → name のみ。
export async function updateMyMemberAction(
  tripId: string,
  newName: string,
): Promise<{ error: string | null }> {
  const t = await getTranslations("validation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: t("loginRequired") };
  }

  const name = newName.trim();
  if (!name) {
    return { error: t("enterName") };
  }
  if (name.length > 32) {
    return { error: t("nameTooLong") };
  }

  const result = await updateMyMemberName(supabase, tripId, user.id, name);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/trips/${tripId}`);
  return { error: null };
}

// ── TODO（やりたいこと） ─────────────────────────────────────────────
// 共有リスト。作成だけ created_by_member_id 解決のため RPC、
// 更新（チェック / 本文 / 優先度）と削除は RLS 配下の素の table 操作。

const TODO_PRIORITIES = ["high", "medium", "low"];
const TODO_KINDS = ["prep", "onsite"];
const TODO_VISIBILITIES = ["shared", "private"];

export async function createTodoAction(
  tripId: string,
  title: string,
  priority: string,
  kind: string,
  visibility: string,
): Promise<{ error: string | null }> {
  const t = await getTranslations("validation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("loginRequired") };

  const trimmed = title.trim();
  if (!trimmed) return { error: t("enterContent") };
  if (!TODO_PRIORITIES.includes(priority)) {
    return { error: t("invalidPriority") };
  }
  if (!TODO_KINDS.includes(kind)) {
    return { error: t("invalidTodoKind") };
  }
  if (!TODO_VISIBILITIES.includes(visibility)) {
    return { error: t("invalidVisibility") };
  }

  const result = await createTodo(supabase, {
    tripId,
    title: trimmed,
    priority,
    kind,
    visibility,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath(`/trips/${tripId}`);
  return { error: null };
}

export async function toggleTodoAction(
  tripId: string,
  todoId: string,
  done: boolean,
): Promise<{ error: string | null }> {
  const t = await getTranslations("validation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("loginRequired") };

  const result = await setTodoDone(supabase, todoId, done);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/trips/${tripId}`);
  return { error: null };
}

export async function updateTodoAction(
  tripId: string,
  todoId: string,
  fields: { title?: string; priority?: string },
): Promise<{ error: string | null }> {
  const t = await getTranslations("validation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("loginRequired") };

  const patch: { title?: string; priority?: string } = {};
  if (fields.title !== undefined) {
    const trimmed = fields.title.trim();
    if (!trimmed) return { error: t("enterContent") };
    patch.title = trimmed;
  }
  if (fields.priority !== undefined) {
    if (!TODO_PRIORITIES.includes(fields.priority)) {
      return { error: t("invalidPriority") };
    }
    patch.priority = fields.priority;
  }
  if (Object.keys(patch).length === 0) return { error: null };

  const result = await updateTodo(supabase, todoId, patch);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/trips/${tripId}`);
  return { error: null };
}

export async function deleteTodoAction(
  tripId: string,
  todoId: string,
): Promise<{ error: string | null }> {
  const t = await getTranslations("validation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("loginRequired") };

  const result = await deleteTodo(supabase, todoId);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/trips/${tripId}`);
  return { error: null };
}

// 現地TODO のいいねトグル。RLS で active member 限定。
// 既にいいね済みなら delete、未いいねなら insert。
// 「現地TODO 限定」は UI 側だけのガード（DB は kind を問わない）。
export async function toggleTodoLikeAction(
  tripId: string,
  todoId: string,
): Promise<{ error: string | null; liked: boolean }> {
  const t = await getTranslations("validation");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("loginRequired"), liked: false };

  const tErr = await getTranslations("errors");
  const result = await toggleTodoLike(supabase, tripId, todoId, user.id);
  if (!result.ok) return { error: translateSharedError(result.error, tErr), liked: result.liked };

  revalidatePath(`/trips/${tripId}`);
  return { error: null, liked: result.liked };
}
