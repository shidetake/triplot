import {
  instantOf,
  isValidTimeZone,
  type OffsetTime,
  parseOffsetTime,
  resolveAiTime,
  tzOffsetMinutes,
  formatOffset,
} from "../aiTime";
import {
  candidateToPlaceInput,
  fetchPlaceDetails,
  searchPlaces,
  type PlaceCandidate,
} from "../placesSearch";
import {
  buildTripTzTimeline,
  resolveEventTz,
  type ScheduleEvent,
  timelineFor,
  timelineForEvent,
  type TripTzTimeline,
} from "../schedule";
import { iconForSharedPlace } from "../sharedPlace";
import { tripBiasCenter } from "../tripBias";
import {
  deriveAverageRates,
  deriveOrderedExpenses,
  deriveScheduleEvents,
} from "../tripDerive";
import { fetchFxRates, rateTo } from "../fxRates";
import type { DB } from "./client";
import { createEvent, deleteEvent, type EventFields, updateEvent } from "./events";
import {
  createExpense,
  deleteExpense,
  type ExpenseFields,
  updateExpense,
} from "./expenses";
import type { PlaceInput } from "./place";
import { deletePlace, updatePlace } from "./places";
import { addSharedPlace } from "./sharedPlace";
import { fetchTripDetailRows, type TripDetailRows } from "./reads/tripDetail";
import { createTodo, deleteTodo, setTodoCompleted, updateTodo } from "./todos";
import { err, ok, type Result } from "./result";

// AI（MCP）からの書き込み。AI は本人の代理なので、権限も記録も本人の操作と
// 同じ（RLS がそのまま効き、作成者は本人になる）。ここが持つのは、AI が送って
// くる「人が読む形」（メンバーの名前・場所の名前・時差付きの時刻）を triplot の
// 持ち方に直す変換と、その時の検査だけ。
//
// 失敗は AI がそのまま読んで直せる文で返す（何が足りないか・何を送り直すか）。
// 設計: docs/design/mcp.md

export type AiTripContext = {
  tripId: string;
  defaultCurrency: string;
  myMemberId: string;
  members: { id: string; name: string }[];
  categories: { id: string; name: string; key: string | null }[];
  places: { id: string; name: string; lat: number | null; lng: number | null }[];
  events: ScheduleEvent[];
  timeline: TripTzTimeline;
  averageRates: Partial<Record<string, number>>;
  pinIcons: string[];
  /** 今の値（変える時に、送られてこなかった項目をそのまま残すため） */
  rows: TripDetailRows;
};

/** 書き込みの前に、旅行の中身を1回読んで変換の材料を揃える。 */
export async function loadAiTripContext(
  sb: DB,
  tripId: string,
  userId: string,
): Promise<Result<AiTripContext>> {
  const rows = await fetchTripDetailRows(sb, tripId);
  if (!rows.trip) return err("Trip not found.");
  const me = (rows.members ?? []).find(
    (m) => m.user_id === userId && m.left_at === null,
  );
  if (!me) return err("You are not a member of this trip.");
  const events = deriveScheduleEvents(rows.eventsRaw, rows.todosRaw);
  const timeline = buildTripTzTimeline(events, rows.trip.default_timezone);
  return ok({
    tripId,
    defaultCurrency: rows.trip.default_currency,
    myMemberId: me.id,
    members: (rows.members ?? [])
      .filter((m) => m.left_at === null)
      .map((m) => ({ id: m.id, name: m.display_name })),
    categories: (rows.categoriesRaw ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      key: c.key ?? null,
    })),
    places: (rows.placesRaw ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
    })),
    events,
    timeline,
    averageRates: deriveAverageRates(
      deriveOrderedExpenses(rows.expensesRaw, timeline),
      rows.trip.default_currency,
    ),
    pinIcons: (rows.pinOptionsRaw ?? []).map((o) => o.icon),
    rows,
  });
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * メンバーの名前を id に直す。"me" は本人。名前が見つからない・同じ名前が
 * 2人いる時は、選べる名前を添えて断る。
 */
export function resolveMembers(
  ctx: AiTripContext,
  names: string[],
): Result<string[]> {
  const ids: string[] = [];
  for (const raw of names) {
    if (norm(raw) === "me") {
      ids.push(ctx.myMemberId);
      continue;
    }
    const hits = ctx.members.filter((m) => norm(m.name) === norm(raw));
    if (hits.length !== 1) {
      const known = ctx.members.map((m) => m.name).join(", ");
      return err(
        hits.length === 0
          ? `No member named "${raw}". Members: ${known} (or "me").`
          : `More than one member is named "${raw}"; ask the user who they mean.`,
      );
    }
    ids.push(hits[0].id);
  }
  return ok([...new Set(ids)]);
}

export type AiPlaceRef = { place?: string; googlePlaceId?: string };

/**
 * 予定・費用の場所を決める。Google の場所の id（search_places の結果）が
 * あればそれ、名前なら旅行の中の同じ名前の場所、無ければ名前だけの場所。
 */
export async function resolvePlaceRef(
  ctx: AiTripContext,
  ref: AiPlaceRef,
  apiKey: string | undefined,
): Promise<Result<PlaceInput>> {
  if (ref.googlePlaceId) {
    if (!apiKey) return err("Place lookup is not available right now.");
    const c = await fetchPlaceDetails(ref.googlePlaceId, { apiKey }).catch(
      () => null,
    );
    if (!c) return err(`Google place "${ref.googlePlaceId}" was not found.`);
    return ok({
      ...candidateToPlaceInput(c),
      icon: iconForSharedPlace(c.primaryType, ctx.pinIcons),
    } as PlaceInput);
  }
  const name = ref.place?.trim();
  if (!name) return ok({ kind: "saved", placeId: null });
  const saved = ctx.places.find((p) => norm(p.name) === norm(name));
  if (saved) return ok({ kind: "saved", placeId: saved.id });
  return ok({ kind: "free", label: name });
}

/** 場所を探す（AI が場所を足す・予定に付ける前に Google の id を得るため）。 */
export async function aiSearchPlaces(
  ctx: AiTripContext,
  query: string,
  apiKey: string,
): Promise<PlaceCandidate[]> {
  const center = tripBiasCenter({
    events: ctx.events,
    places: ctx.places,
    drafts: null,
    target: null,
    memberId: ctx.myMemberId,
  });
  return searchPlaces(query, {
    apiKey,
    biasCenter: center,
    allowUnbiased: true,
    withRatings: true,
  });
}

export async function aiAddPlace(
  sb: DB,
  ctx: AiTripContext,
  input: {
    googlePlaceId: string;
    decided: boolean;
    note: string;
    private: boolean;
  },
  apiKey: string | undefined,
): Promise<Result<string>> {
  if (!apiKey) return err("Place lookup is not available right now.");
  const c = await fetchPlaceDetails(input.googlePlaceId, { apiKey }).catch(
    () => null,
  );
  if (!c) return err(`Google place "${input.googlePlaceId}" was not found.`);
  const added = await addSharedPlace(sb, ctx.tripId, c, {
    tentative: !input.decided,
    visibility: input.private ? "private" : "shared",
    note: input.note,
  });
  if (!added.ok) return err(added.error);
  if (added.data === "exists") {
    return ok(`"${c.name}" is already in this trip; nothing was added.`);
  }
  return ok(
    `Added "${c.name}" (${c.formattedAddress}) as ${input.decided ? "a decided place" : "a candidate"}.`,
  );
}

export async function aiAddTodo(
  sb: DB,
  ctx: AiTripContext,
  input: {
    title: string;
    priority: "high" | "medium" | "low";
    when: "before_trip" | "during_trip";
    private: boolean;
  },
): Promise<Result<string>> {
  const title = input.title.trim();
  if (!title) return err("The to-do needs a title.");
  const r = await createTodo(sb, {
    tripId: ctx.tripId,
    title,
    priority: input.priority,
    kind: input.when === "during_trip" ? "onsite" : "prep",
    visibility: input.private ? "private" : "shared",
  });
  if (!r.ok) return err(r.error);
  return ok(`Added the to-do "${title}".`);
}

function readTime(s: string, label: string): Result<OffsetTime> {
  const t = parseOffsetTime(s);
  if (!t) {
    return err(
      `${label}: "${s}" is not a local time with a UTC offset. Send it like 2027-08-11T12:00-10:00 (the local time at the place, with that place's offset).`,
    );
  }
  return ok(t);
}

function participantsOf(
  ctx: AiTripContext,
  participants: string[] | "everyone",
  isPrivate: boolean,
): Result<{ everyone: boolean; ids: string[] }> {
  if (isPrivate || participants === "everyone") {
    return ok({ everyone: true, ids: [] });
  }
  const ids = resolveMembers(ctx, participants);
  if (!ids.ok) return ids;
  if (ids.data.length === 0) return err("List at least one participant, or use \"everyone\".");
  return ok({ everyone: false, ids: ids.data });
}

export async function aiAddEvent(
  sb: DB,
  ctx: AiTripContext,
  input: {
    title: string;
    start?: string;
    end?: string;
    allDayStartDate?: string;
    allDayEndDate?: string;
    place: AiPlaceRef;
    participants: string[] | "everyone";
    note: string;
    private: boolean;
    needsReservation: boolean;
  },
  apiKey: string | undefined,
): Promise<Result<string>> {
  const title = input.title.trim();
  if (!title) return err("The event needs a title.");
  const who = participantsOf(ctx, input.participants, input.private);
  if (!who.ok) return who;
  const place = await resolvePlaceRef(ctx, input.place, apiKey);
  if (!place.ok) return place;

  const common = {
    kind: "normal",
    title,
    startTz: null,
    endTz: null,
    visibility: input.private ? ("private" as const) : ("shared" as const),
    note: input.note,
    participantsEveryone: who.data.everyone,
    participantMemberIds: who.data.ids,
    startPlace: place.data,
    endPlace: null,
  };

  if (input.allDayStartDate) {
    const start = input.allDayStartDate;
    const end = input.allDayEndDate ?? start;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return err("All-day dates must look like 2027-08-11.");
    }
    if (end < start) return err("The all-day end date is before the start date.");
    const r = await createEvent(
      sb,
      ctx.tripId,
      {
        ...common,
        allDay: true,
        startAt: `${start}T00:00:00`,
        endAt: `${end}T00:00:00`,
        tzDisambigTransitId: null,
        tzDisambigSide: null,
      },
      input.needsReservation,
    );
    if (!r.ok) return err(r.error);
    return ok(`Added the all-day event "${title}" (${start}${end !== start ? ` – ${end}` : ""}).`);
  }

  if (!input.start || !input.end) {
    return err("A timed event needs both start and end (or use all_day_start_date for an all-day event).");
  }
  const s = readTime(input.start, "start");
  if (!s.ok) return s;
  const e = readTime(input.end, "end");
  if (!e.ok) return e;
  const timed = timedEvent(ctx, who.data, s.data, e.data);
  if (!timed.ok) return timed;
  const r = await createEvent(
    sb,
    ctx.tripId,
    { ...common, allDay: false, ...timed.data },
    input.needsReservation,
  );
  if (!r.ok) return err(r.error);
  return ok(`Added the event "${title}" (${input.start} – ${input.end}).`);
}

// 時刻のある予定の検査（足す・変えるで共通）。予定の時刻は参加者の居場所で
// 決まる（年表は人ごと。schedule.ts の timelineFor）。予定はタイムゾーンを
// 跨がない（終わりも始まりと同じ土地の時刻）。
function timedEvent(
  ctx: AiTripContext,
  who: { everyone: boolean; ids: string[] },
  s: OffsetTime,
  e: OffsetTime,
): Result<
  Pick<EventFields, "startAt" | "endAt" | "tzDisambigTransitId" | "tzDisambigSide">
> {
  if (instantOf(e) <= instantOf(s)) return err("end must be after start.");
  const tl = who.everyone ? ctx.timeline : timelineFor(ctx.timeline, who.ids);
  const start = resolveAiTime(s, tl, "start");
  if (!start.ok) return err(start.message);
  if (start.tz) {
    const expected = tzOffsetMinutes(start.tz, e.wall);
    if (expected !== e.offsetMinutes) {
      return err(
        `end: the event is in ${start.tz}, so end must use its offset (UTC${formatOffset(expected)}). An event that moves between time zones is a transit.`,
      );
    }
  }
  return ok({
    startAt: start.wall,
    endAt: `${e.wall}:00`,
    tzDisambigTransitId: start.disambig?.transitId ?? null,
    tzDisambigSide: start.disambig?.side ?? null,
  });
}

export async function aiAddTransit(
  sb: DB,
  ctx: AiTripContext,
  input: {
    title: string;
    depart: { time: string; timeZone: string } & AiPlaceRef;
    arrive: { time: string; timeZone: string } & AiPlaceRef;
    participants: string[] | "everyone";
    note: string;
    private: boolean;
    needsReservation: boolean;
  },
  apiKey: string | undefined,
): Promise<Result<string>> {
  const title = input.title.trim();
  if (!title) return err("The transit needs a title (e.g. a flight number).");
  const who = participantsOf(ctx, input.participants, input.private);
  if (!who.ok) return who;

  const ends: { wall: string; tz: string }[] = [];
  for (const [label, end] of [
    ["depart", input.depart],
    ["arrive", input.arrive],
  ] as const) {
    if (!isValidTimeZone(end.timeZone)) {
      return err(`${label}.time_zone: "${end.timeZone}" is not an IANA time zone (e.g. Asia/Tokyo).`);
    }
    const t = readTime(end.time, `${label}.time`);
    if (!t.ok) return t;
    const expected = tzOffsetMinutes(end.timeZone, t.data.wall);
    if (expected !== t.data.offsetMinutes) {
      return err(
        `${label}.time: in ${end.timeZone} the offset at that time is UTC${formatOffset(expected)}, but UTC${formatOffset(t.data.offsetMinutes)} was sent. Send the local time at the ${label === "depart" ? "departure" : "arrival"} place.`,
      );
    }
    ends.push({ wall: `${t.data.wall}:00`, tz: end.timeZone });
  }
  const depart = parseOffsetTime(input.depart.time)!;
  const arrive = parseOffsetTime(input.arrive.time)!;
  if (instantOf(arrive) <= instantOf(depart)) {
    return err("arrive must be after depart.");
  }
  const from = await resolvePlaceRef(ctx, input.depart, apiKey);
  if (!from.ok) return from;
  const to = await resolvePlaceRef(ctx, input.arrive, apiKey);
  if (!to.ok) return to;

  const r = await createEvent(
    sb,
    ctx.tripId,
    {
      kind: "transit",
      allDay: false,
      title,
      startAt: ends[0].wall,
      endAt: ends[1].wall,
      startTz: ends[0].tz,
      endTz: ends[1].tz,
      tzDisambigTransitId: null,
      tzDisambigSide: null,
      visibility: input.private ? "private" : "shared",
      note: input.note,
      participantsEveryone: who.data.everyone,
      participantMemberIds: who.data.ids,
      startPlace: from.data,
      endPlace:
        to.data.kind === "saved" && !to.data.placeId ? null : to.data,
    },
    input.needsReservation,
  );
  if (!r.ok) return err(r.error);
  return ok(`Added the transit "${title}" (${input.depart.time} → ${input.arrive.time}).`);
}

export async function aiAddExpense(
  sb: DB,
  ctx: AiTripContext,
  input: {
    amount: number;
    currency: string;
    rateToSettlementCurrency?: number;
    paidAt?: string;
    paidOn?: string;
    category?: string;
    payer: string;
    split: string[] | "everyone" | "none";
    place: AiPlaceRef;
    note: string;
    private: boolean;
  },
  apiKey: string | undefined,
): Promise<Result<string>> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return err("amount must be a positive number.");
  }
  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return err("currency must be a 3-letter code like JPY or USD.");
  }

  const payer = resolveMembers(ctx, [input.payer]);
  if (!payer.ok) return payer;
  const payerId = payer.data[0];

  // いつ払ったか。時刻があれば時差付きで受け、払った人の居場所と突き合わせる。
  let paidAt: string;
  let disambig: { transitId: string; side: "depart" | "arrive" } | null = null;
  let date: string;
  if (input.paidAt) {
    const t = readTime(input.paidAt, "paid_at");
    if (!t.ok) return t;
    const r = resolveAiTime(t.data, timelineFor(ctx.timeline, [payerId]), "paid_at");
    if (!r.ok) return err(r.message);
    paidAt = r.wall;
    disambig = r.disambig;
    date = t.data.wall.slice(0, 10);
  } else if (input.paidOn && /^\d{4}-\d{2}-\d{2}$/.test(input.paidOn)) {
    // 日付だけ（時刻を入れていない費用は 00:00 で持つ。アプリと同じ）。
    paidAt = `${input.paidOn}T00:00:00`;
    date = input.paidOn;
  } else {
    return err("Give paid_at (local time with offset) or paid_on (date like 2027-08-11).");
  }

  // 精算通貨への換算レート。指定 → 旅行の中の同じ通貨の平均 → その日の為替。
  let rate = input.rateToSettlementCurrency;
  if (currency === ctx.defaultCurrency) rate = 1;
  rate ??= ctx.averageRates[currency];
  // 為替は過去の日付しか引けないので、先の日付（計画中の旅行）は今日のレートで代える。
  const today = new Date().toISOString().slice(0, 10);
  rate ??=
    rateTo(await fetchFxRates(currency, date < today ? date : today), ctx.defaultCurrency) ??
    undefined;
  if (!rate || !Number.isFinite(rate) || rate <= 0) {
    return err(
      `No exchange rate for ${currency} → ${ctx.defaultCurrency}. Ask the user for the rate and send rate_to_settlement_currency.`,
    );
  }

  let categoryId: string | undefined;
  if (input.category?.trim()) {
    const c = ctx.categories.find(
      (x) => norm(x.name) === norm(input.category!) || (x.key && norm(x.key) === norm(input.category!)),
    );
    if (!c) {
      return err(
        `No category "${input.category}". Categories: ${ctx.categories.map((x) => x.name).join(", ")}.`,
      );
    }
    categoryId = c.id;
  } else {
    categoryId = (ctx.categories.find((x) => x.key === "uncategorized") ?? ctx.categories.at(-1))?.id;
  }
  if (!categoryId) return err("This trip has no expense categories.");

  // 割り勘。自分だけの費用は割り勘しない（アプリと同じ決まり）。
  const splittable = !input.private && input.split !== "none";
  let splitEveryone = true;
  let splitIds: string[] = [];
  if (splittable && input.split !== "everyone") {
    const ids = resolveMembers(ctx, input.split as string[]);
    if (!ids.ok) return ids;
    if (ids.data.length === 0) return err("List who shares it, or use \"everyone\" / \"none\".");
    splitEveryone = false;
    splitIds = ids.data;
  }

  const place = await resolvePlaceRef(ctx, input.place, apiKey);
  if (!place.ok) return place;

  const r = await createExpense(sb, ctx.tripId, {
    localPrice: input.amount,
    localCurrency: currency,
    rateToDefault: rate,
    categoryId,
    payerMemberId: payerId,
    visibility: input.private ? "private" : "shared",
    splittable,
    splitEveryone,
    splitMemberIds: splitIds,
    note: input.note,
    paidAt,
    tzDisambigTransitId: disambig?.transitId ?? null,
    tzDisambigSide: disambig?.side ?? null,
    place: place.data,
  });
  if (!r.ok) return err(r.error);
  return ok(
    `Added the expense ${input.amount} ${currency}${currency !== ctx.defaultCurrency ? ` (rate ${rate} to ${ctx.defaultCurrency})` : ""}.`,
  );
}

// ──────────────────────────────────────────────
// 変える・消す
//
// どれを指すかは get_trip に載せた id で受ける（id は AI と triplot の間だけで
// 使う。利用者には見せない）。送られてこなかった項目は今の値のまま残す。
// 返事には、どれを変えた・消したかと前後の値を入れる（AI がそれを利用者に
// 伝えるので、違うものを指していたらその場で気付ける）。
// ──────────────────────────────────────────────

type RawEvent = NonNullable<TripDetailRows["eventsRaw"]>[number];
type RawExpense = NonNullable<TripDetailRows["expensesRaw"]>[number];

const wallOf = (ts: string | null) => (ts ? ts.slice(0, 16).replace("T", " ") : "");

/** "YYYY-MM-DDTHH:MM" に分を足す（壁時計のまま。タイムゾーンは跨がない前提）。 */
function addMinutes(wall: string, minutes: number): string {
  return new Date(Date.parse(`${wall}:00Z`) + minutes * 60_000)
    .toISOString()
    .slice(0, 16);
}

function minutesBetween(a: string, b: string): number {
  return (Date.parse(`${b.slice(0, 16)}:00Z`) - Date.parse(`${a.slice(0, 16)}:00Z`)) / 60_000;
}

function describeEvent(e: Pick<RawEvent, "title" | "start_at" | "end_at" | "all_day">) {
  return e.all_day
    ? `"${e.title}" (all day ${e.start_at.slice(0, 10)}${e.end_at && e.end_at.slice(0, 10) !== e.start_at.slice(0, 10) ? ` – ${e.end_at.slice(0, 10)}` : ""})`
    : `"${e.title}" (${wallOf(e.start_at)} – ${wallOf(e.end_at)})`;
}

function findEvent(ctx: AiTripContext, id: string): Result<RawEvent> {
  const e = (ctx.rows.eventsRaw ?? []).find((x) => x.id === id);
  return e ? ok(e) : err(`No event with id ${id} in this trip. Call get_trip to see current ids.`);
}

/** 今の予定を、そのまま書き戻せる形にする（変える項目だけ上書きする土台）。 */
function currentEventFields(ctx: AiTripContext, e: RawEvent): EventFields {
  return {
    kind: e.kind,
    allDay: e.all_day,
    title: e.title,
    startAt: e.start_at,
    endAt: e.end_at,
    startTz: e.start_tz,
    endTz: e.end_tz,
    tzDisambigTransitId: e.tz_disambig_transit_id,
    tzDisambigSide: e.tz_disambig_side as EventFields["tzDisambigSide"],
    visibility: e.visibility as EventFields["visibility"],
    note: e.note ?? "",
    participantsEveryone: e.participants_everyone,
    participantMemberIds: (e.event_participants ?? []).map((p) => p.member_id),
    startPlace: { kind: "saved", placeId: e.start_place_id },
    endPlace: e.end_place_id ? { kind: "saved", placeId: e.end_place_id } : null,
  };
}

const needsReservationOf = (ctx: AiTripContext, id: string) =>
  ctx.events.find((x) => x.id === id)?.needsReservation ?? false;

export async function aiUpdateEvent(
  sb: DB,
  ctx: AiTripContext,
  input: {
    id: string;
    title?: string;
    start?: string;
    end?: string;
    allDayStartDate?: string;
    allDayEndDate?: string;
    place?: AiPlaceRef;
    participants?: string[] | "everyone";
    note?: string;
    private?: boolean;
    needsReservation?: boolean;
  },
  apiKey: string | undefined,
): Promise<Result<string>> {
  const found = findEvent(ctx, input.id);
  if (!found.ok) return found;
  const old = found.data;
  if (old.kind === "transit") return err("This is a transit; use update_transit.");
  const f = currentEventFields(ctx, old);

  if (input.title !== undefined) {
    if (!input.title.trim()) return err("The title can't be empty.");
    f.title = input.title.trim();
  }
  if (input.note !== undefined) f.note = input.note;
  if (input.private !== undefined) f.visibility = input.private ? "private" : "shared";
  if (input.participants !== undefined || input.private) {
    const who = participantsOf(
      ctx,
      input.participants ?? (f.participantsEveryone ? "everyone" : memberNames(ctx, f.participantMemberIds)),
      f.visibility === "private",
    );
    if (!who.ok) return who;
    f.participantsEveryone = who.data.everyone;
    f.participantMemberIds = who.data.ids;
  }
  if (input.place && (input.place.place !== undefined || input.place.googlePlaceId)) {
    const place = await resolvePlaceRef(ctx, input.place, apiKey);
    if (!place.ok) return place;
    f.startPlace = place.data;
  }

  if (input.allDayStartDate) {
    const start = input.allDayStartDate;
    const end = input.allDayEndDate ?? start;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return err("All-day dates must look like 2027-08-11.");
    }
    if (end < start) return err("The all-day end date is before the start date.");
    Object.assign(f, {
      allDay: true,
      startAt: `${start}T00:00:00`,
      endAt: `${end}T00:00:00`,
      tzDisambigTransitId: null,
      tzDisambigSide: null,
    });
  } else if (input.start || input.end) {
    // 片方だけ送られたら、もう片方は今の値から決める（始まりだけなら長さを保つ）。
    const oldTz = old.all_day
      ? null
      : resolveEventTz(
          old.start_at.slice(0, 10),
          old.tz_disambig_transit_id,
          old.tz_disambig_side as "depart" | "arrive" | null,
          timelineForEvent(ctx.timeline, {
            participantsEveryone: old.participants_everyone,
            participantMemberIds: (old.event_participants ?? []).map((p) => p.member_id),
          }),
        );
    let s: OffsetTime;
    let e: OffsetTime;
    if (input.start) {
      const r = readTime(input.start, "start");
      if (!r.ok) return r;
      s = r.data;
    } else {
      if (old.all_day) return err("This is an all-day event; send both start and end to give it times.");
      const wall = old.start_at.slice(0, 16);
      s = { wall, offsetMinutes: oldTz ? tzOffsetMinutes(oldTz, wall) : 0 };
    }
    if (input.end) {
      const r = readTime(input.end, "end");
      if (!r.ok) return r;
      e = r.data;
    } else {
      if (old.all_day || !old.end_at) {
        return err("Send end as well (this event has no length to keep).");
      }
      e = {
        wall: addMinutes(s.wall, minutesBetween(old.start_at, old.end_at)),
        offsetMinutes: s.offsetMinutes,
      };
    }
    if (!input.start && !oldTz) s = { ...s, offsetMinutes: e.offsetMinutes };
    const timed = timedEvent(
      ctx,
      { everyone: f.participantsEveryone, ids: f.participantMemberIds },
      s,
      e,
    );
    if (!timed.ok) return timed;
    Object.assign(f, { allDay: false, ...timed.data });
  }

  const reservation = input.needsReservation ?? needsReservationOf(ctx, old.id);
  const r = await updateEvent(sb, old.id, f, reservation);
  if (!r.ok) return err(r.error);
  return ok(
    `Changed the event ${describeEvent(old)} → ${describeEvent({
      title: f.title,
      start_at: f.startAt,
      end_at: f.endAt,
      all_day: f.allDay,
    })}.`,
  );
}

function memberNames(ctx: AiTripContext, ids: string[]): string[] {
  return ids.map((id) => ctx.members.find((m) => m.id === id)?.name ?? id);
}

export async function aiUpdateTransit(
  sb: DB,
  ctx: AiTripContext,
  input: {
    id: string;
    title?: string;
    depart?: { time: string; timeZone: string } & AiPlaceRef;
    arrive?: { time: string; timeZone: string } & AiPlaceRef;
    participants?: string[] | "everyone";
    note?: string;
    private?: boolean;
    needsReservation?: boolean;
  },
  apiKey: string | undefined,
): Promise<Result<string>> {
  const found = findEvent(ctx, input.id);
  if (!found.ok) return found;
  const old = found.data;
  if (old.kind !== "transit") return err("This is not a transit; use update_event.");
  const f = currentEventFields(ctx, old);

  if (input.title !== undefined) {
    if (!input.title.trim()) return err("The title can't be empty.");
    f.title = input.title.trim();
  }
  if (input.note !== undefined) f.note = input.note;
  if (input.private !== undefined) f.visibility = input.private ? "private" : "shared";
  if (input.participants !== undefined || input.private) {
    const who = participantsOf(
      ctx,
      input.participants ?? (f.participantsEveryone ? "everyone" : memberNames(ctx, f.participantMemberIds)),
      f.visibility === "private",
    );
    if (!who.ok) return who;
    f.participantsEveryone = who.data.everyone;
    f.participantMemberIds = who.data.ids;
  }
  for (const [label, end] of [
    ["depart", input.depart],
    ["arrive", input.arrive],
  ] as const) {
    if (!end) continue;
    if (!isValidTimeZone(end.timeZone)) {
      return err(`${label}.time_zone: "${end.timeZone}" is not an IANA time zone (e.g. Asia/Tokyo).`);
    }
    const t = readTime(end.time, `${label}.time`);
    if (!t.ok) return t;
    const expected = tzOffsetMinutes(end.timeZone, t.data.wall);
    if (expected !== t.data.offsetMinutes) {
      return err(
        `${label}.time: in ${end.timeZone} the offset at that time is UTC${formatOffset(expected)}, but UTC${formatOffset(t.data.offsetMinutes)} was sent.`,
      );
    }
    if (label === "depart") {
      f.startAt = `${t.data.wall}:00`;
      f.startTz = end.timeZone;
    } else {
      f.endAt = `${t.data.wall}:00`;
      f.endTz = end.timeZone;
    }
    if (end.place !== undefined || end.googlePlaceId) {
      const place = await resolvePlaceRef(ctx, end, apiKey);
      if (!place.ok) return place;
      if (label === "depart") f.startPlace = place.data;
      else f.endPlace = place.data;
    }
  }
  if (f.endAt && f.startTz && f.endTz) {
    const dep = Date.parse(`${f.startAt.slice(0, 16)}:00Z`) -
      tzOffsetMinutes(f.startTz, f.startAt.slice(0, 16)) * 60_000;
    const arr = Date.parse(`${f.endAt.slice(0, 16)}:00Z`) -
      tzOffsetMinutes(f.endTz, f.endAt.slice(0, 16)) * 60_000;
    if (arr <= dep) return err("arrive must be after depart.");
  }

  const reservation = input.needsReservation ?? needsReservationOf(ctx, old.id);
  const r = await updateEvent(sb, old.id, f, reservation);
  if (!r.ok) return err(r.error);
  return ok(
    `Changed the transit "${old.title}" (${wallOf(old.start_at)} ${old.start_tz} → ${wallOf(old.end_at)} ${old.end_tz}) → "${f.title}" (${wallOf(f.startAt)} ${f.startTz} → ${wallOf(f.endAt)} ${f.endTz}).`,
  );
}

export async function aiUpdatePlace(
  sb: DB,
  ctx: AiTripContext,
  input: { id: string; decided?: boolean; note?: string; private?: boolean },
): Promise<Result<string>> {
  const p = (ctx.rows.placesRaw ?? []).find((x) => x.id === input.id);
  if (!p) return err(`No place with id ${input.id} in this trip. Call get_trip to see current ids.`);
  const tentative = input.decided !== undefined ? !input.decided : p.tentative;
  const r = await updatePlace(sb, p.id, {
    tentative,
    visibility: input.private !== undefined ? (input.private ? "private" : "shared") : (p.visibility as "shared" | "private"),
    note: input.note ?? p.note ?? "",
    icon: p.icon ?? "",
  });
  if (!r.ok) return err(r.error);
  const changes = [
    input.decided !== undefined && tentative !== p.tentative
      ? `now ${tentative ? "a candidate" : "decided"}`
      : null,
    input.note !== undefined ? "note updated" : null,
    input.private !== undefined ? (input.private ? "now private" : "now shared") : null,
  ].filter(Boolean);
  return ok(`Changed the place "${p.name}"${changes.length ? `: ${changes.join(", ")}` : ""}.`);
}

export async function aiUpdateTodo(
  sb: DB,
  ctx: AiTripContext,
  input: {
    id: string;
    title?: string;
    priority?: "high" | "medium" | "low";
    when?: "before_trip" | "during_trip";
    done?: boolean;
  },
): Promise<Result<string>> {
  const t = (ctx.rows.todosRaw ?? []).find((x) => x.id === input.id);
  if (!t) return err(`No to-do with id ${input.id} in this trip. Call get_trip to see current ids.`);
  if (input.title !== undefined && !input.title.trim()) return err("The title can't be empty.");
  const r = await updateTodo(sb, t.id, {
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.when ? { kind: input.when === "during_trip" ? "onsite" : "prep" } : {}),
  });
  if (!r.ok) return err(r.error);
  // 済みは一人ずつ記録する（TODO 全体の完了は DB が決める）。AI は本人の分だけ付け外しする。
  if (input.done !== undefined) {
    const c = await setTodoCompleted(sb, t.id, ctx.myMemberId, input.done);
    if (!c.ok) return err(c.error);
  }
  const changes = [
    input.title !== undefined && input.title.trim() !== t.title ? `title → "${input.title.trim()}"` : null,
    input.priority && input.priority !== t.priority ? `priority → ${input.priority}` : null,
    input.when ? `when → ${input.when}` : null,
    input.done !== undefined ? (input.done ? "marked done by you" : "unmarked for you") : null,
  ].filter(Boolean);
  return ok(`Changed the to-do "${t.title}"${changes.length ? `: ${changes.join(", ")}` : ""}.`);
}

function describeExpense(ctx: AiTripContext, x: Pick<RawExpense, "local_price" | "local_currency" | "paid_at" | "note">) {
  const when = x.paid_at?.slice(11, 16) === "00:00" ? x.paid_at.slice(0, 10) : wallOf(x.paid_at);
  return `${x.local_price} ${x.local_currency} on ${when}${x.note ? ` ("${x.note}")` : ""}`;
}

export async function aiUpdateExpense(
  sb: DB,
  ctx: AiTripContext,
  input: {
    id: string;
    amount?: number;
    currency?: string;
    rateToSettlementCurrency?: number;
    paidAt?: string;
    paidOn?: string;
    category?: string;
    payer?: string;
    split?: string[] | "everyone" | "none";
    place?: AiPlaceRef;
    note?: string;
    private?: boolean;
  },
  apiKey: string | undefined,
): Promise<Result<string>> {
  const x = (ctx.rows.expensesRaw ?? []).find((e) => e.id === input.id);
  if (!x) return err(`No expense with id ${input.id} in this trip. Call get_trip to see current ids.`);
  const f: ExpenseFields = {
    localPrice: x.local_price,
    localCurrency: x.local_currency,
    rateToDefault: x.rate_to_default,
    categoryId: x.category_id,
    payerMemberId: x.payer_member_id,
    visibility: x.visibility as ExpenseFields["visibility"],
    splittable: x.splittable,
    splitEveryone: x.split_everyone,
    splitMemberIds: (x.expense_splits ?? []).map((s) => s.member_id),
    note: x.note ?? "",
    paidAt: x.paid_at,
    tzDisambigTransitId: x.tz_disambig_transit_id,
    tzDisambigSide: x.tz_disambig_side as ExpenseFields["tzDisambigSide"],
    place: { kind: "saved", placeId: x.place_id },
  };

  if (input.amount !== undefined) {
    if (!Number.isFinite(input.amount) || input.amount <= 0) return err("amount must be a positive number.");
    f.localPrice = input.amount;
  }
  if (input.currency !== undefined) {
    const c = input.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(c)) return err("currency must be a 3-letter code like JPY or USD.");
    f.localCurrency = c;
  }
  if (input.payer !== undefined) {
    const payer = resolveMembers(ctx, [input.payer]);
    if (!payer.ok) return payer;
    f.payerMemberId = payer.data[0];
  }
  if (input.private !== undefined) f.visibility = input.private ? "private" : "shared";
  if (input.note !== undefined) f.note = input.note;

  if (input.paidAt) {
    const t = readTime(input.paidAt, "paid_at");
    if (!t.ok) return t;
    const r = resolveAiTime(t.data, timelineFor(ctx.timeline, [f.payerMemberId]), "paid_at");
    if (!r.ok) return err(r.message);
    f.paidAt = r.wall;
    f.tzDisambigTransitId = r.disambig?.transitId ?? null;
    f.tzDisambigSide = r.disambig?.side ?? null;
  } else if (input.paidOn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn)) return err("paid_on must look like 2027-08-11.");
    f.paidAt = `${input.paidOn}T00:00:00`;
    f.tzDisambigTransitId = null;
    f.tzDisambigSide = null;
  }

  // 通貨を変えた時だけレートを決め直す（指定 → 平均 → 為替）。
  if (input.rateToSettlementCurrency !== undefined) {
    f.rateToDefault = input.rateToSettlementCurrency;
  } else if (input.currency !== undefined && f.localCurrency !== x.local_currency) {
    const date = f.paidAt.slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const rate =
      f.localCurrency === ctx.defaultCurrency
        ? 1
        : (ctx.averageRates[f.localCurrency] ??
          rateTo(await fetchFxRates(f.localCurrency, date < today ? date : today), ctx.defaultCurrency));
    if (!rate) {
      return err(`No exchange rate for ${f.localCurrency} → ${ctx.defaultCurrency}. Send rate_to_settlement_currency.`);
    }
    f.rateToDefault = rate;
  }

  if (input.category !== undefined) {
    const c = ctx.categories.find(
      (y) => norm(y.name) === norm(input.category!) || (y.key && norm(y.key) === norm(input.category!)),
    );
    if (!c) return err(`No category "${input.category}". Categories: ${ctx.categories.map((y) => y.name).join(", ")}.`);
    f.categoryId = c.id;
  }

  if (f.visibility === "private") {
    f.splittable = false;
  } else if (input.split !== undefined) {
    if (input.split === "none") {
      f.splittable = false;
    } else if (input.split === "everyone") {
      f.splittable = true;
      f.splitEveryone = true;
      f.splitMemberIds = [];
    } else {
      const ids = resolveMembers(ctx, input.split);
      if (!ids.ok) return ids;
      if (ids.data.length === 0) return err("List who shares it, or use \"everyone\" / \"none\".");
      f.splittable = true;
      f.splitEveryone = false;
      f.splitMemberIds = ids.data;
    }
  }

  if (input.place && (input.place.place !== undefined || input.place.googlePlaceId)) {
    const place = await resolvePlaceRef(ctx, input.place, apiKey);
    if (!place.ok) return place;
    f.place = place.data;
  }

  const r = await updateExpense(sb, x.id, f);
  if (!r.ok) return err(r.error);
  return ok(
    `Changed the expense ${describeExpense(ctx, x)} → ${describeExpense(ctx, {
      local_price: f.localPrice,
      local_currency: f.localCurrency,
      paid_at: f.paidAt,
      note: f.note,
    })}.`,
  );
}

/**
 * 消す。消したものの中身を返事に入れる（AI に「戻して」と頼めば、同じ内容で
 * 足し直せる）。アプリの「元に戻す」はトーストからしか押せないので、AI 経由で
 * 消したものを戻す手段はこれだけ。
 */
export async function aiDeleteItem(
  sb: DB,
  ctx: AiTripContext,
  input: { type: "event" | "place" | "todo" | "expense"; id: string },
): Promise<Result<string>> {
  const notFound = () =>
    err(`No ${input.type} with id ${input.id} in this trip. Call get_trip to see current ids.`);
  if (input.type === "event") {
    const e = (ctx.rows.eventsRaw ?? []).find((x) => x.id === input.id);
    if (!e) return notFound();
    const r = await deleteEvent(sb, e.id);
    if (!r.ok) return err(r.error);
    const place = ctx.places.find((p) => p.id === e.start_place_id)?.name;
    return ok(
      `Deleted the ${e.kind === "transit" ? `transit "${e.title}" (${wallOf(e.start_at)} ${e.start_tz} → ${wallOf(e.end_at)} ${e.end_tz})` : `event ${describeEvent(e)}`}${place ? ` at ${place}` : ""}${e.note ? `, note: ${e.note}` : ""}. To undo, add it again with these details.`,
    );
  }
  if (input.type === "place") {
    const p = (ctx.rows.placesRaw ?? []).find((x) => x.id === input.id);
    if (!p) return notFound();
    const r = await deletePlace(sb, p.id);
    if (!r.ok) return err(r.error);
    return ok(
      `Deleted the place "${p.name}"${p.formatted_address ? ` (${p.formatted_address})` : ""}${p.google_place_id ? `, google_place_id: ${p.google_place_id}` : ""}. Events and expenses that pointed to it no longer have a place. To undo, add it again.`,
    );
  }
  if (input.type === "todo") {
    const t = (ctx.rows.todosRaw ?? []).find((x) => x.id === input.id);
    if (!t) return notFound();
    const r = await deleteTodo(sb, t.id);
    if (!r.ok) return err(r.error);
    return ok(`Deleted the to-do "${t.title}" (priority ${t.priority}). To undo, add it again.`);
  }
  const x = (ctx.rows.expensesRaw ?? []).find((e) => e.id === input.id);
  if (!x) return notFound();
  const r = await deleteExpense(sb, x.id);
  if (!r.ok) return err(r.error);
  const payer = ctx.members.find((m) => m.id === x.payer_member_id)?.name ?? "?";
  const category = ctx.categories.find((c) => c.id === x.category_id)?.name ?? "?";
  return ok(
    `Deleted the expense ${describeExpense(ctx, x)}, ${category}, paid by ${payer}${x.rate_to_default !== 1 ? `, rate ${x.rate_to_default}` : ""}. To undo, add it again with these details.`,
  );
}
