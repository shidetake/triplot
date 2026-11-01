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
  type ScheduleEvent,
  timelineFor,
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
import { createEvent } from "./events";
import { createExpense } from "./expenses";
import type { PlaceInput } from "./place";
import { addSharedPlace } from "./sharedPlace";
import { fetchTripDetailRows } from "./reads/tripDetail";
import { createTodo } from "./todos";
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
  if (instantOf(e.data) <= instantOf(s.data)) {
    return err("end must be after start.");
  }
  // 予定の時刻は参加者の居場所で決まる（年表は人ごと。schedule.ts の timelineFor）。
  const tl = who.data.everyone ? ctx.timeline : timelineFor(ctx.timeline, who.data.ids);
  const start = resolveAiTime(s.data, tl, "start");
  if (!start.ok) return err(start.message);
  // 予定はタイムゾーンを跨がない（終わりも始まりと同じ土地の時刻）。
  if (start.tz) {
    const expected = tzOffsetMinutes(start.tz, e.data.wall);
    if (expected !== e.data.offsetMinutes) {
      return err(
        `end: the event is in ${start.tz}, so end must use its offset (UTC${formatOffset(expected)}). An event that moves between time zones is a transit; use add_transit.`,
      );
    }
  }
  const r = await createEvent(
    sb,
    ctx.tripId,
    {
      ...common,
      allDay: false,
      startAt: start.wall,
      endAt: `${e.data.wall}:00`,
      tzDisambigTransitId: start.disambig?.transitId ?? null,
      tzDisambigSide: start.disambig?.side ?? null,
    },
    input.needsReservation,
  );
  if (!r.ok) return err(r.error);
  return ok(`Added the event "${title}" (${input.start} – ${input.end}).`);
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
