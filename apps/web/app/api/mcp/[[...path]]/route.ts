import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { pipeline } from "@supabase/middleware";
import {
  fromSupabaseUrl,
  withOAuthProtectedResource,
  withSupabase,
} from "@supabase/server";
import { z } from "zod";

import {
  aiAddEvent,
  aiAddExpense,
  aiAddPlace,
  aiAddTodo,
  aiAddTransit,
  aiDeleteItem,
  aiSearchPlaces,
  aiUpdateEvent,
  aiUpdateExpense,
  aiUpdatePlace,
  aiUpdateTodo,
  aiUpdateTransit,
  type AiTripContext,
  loadAiTripContext,
} from "@triplot/shared/data/aiWrites";
import { fetchTripDetailRows } from "@triplot/shared/data/reads/tripDetail";
import { fetchMyTrips } from "@triplot/shared/data/reads/trips";
import { tripForAi } from "@triplot/shared/tripForAi";
import type { Database } from "@triplot/shared/types/database";

import { mcpUrl } from "@/lib/mcp-url";

// AI（Claude・ChatGPT・Gemini 等）が旅行を読み書きする入口（MCP サーバー）。
// AI は旅行のメンバーにはならず、**ログインした本人の代理**として本人の権限で
// 読み書きする（RLS がそのまま効き、足したものは本人が足したものになる）。
// 足す・変える・消すができる。どれを指すかは get_trip に載せた id で受ける（id は
// AI と triplot の間だけで使い、利用者には見せない）。時刻は時差付きで受け、旅程と
// 突き合わせる（@triplot/shared/aiTime）。認可は Supabase Auth の OAuth 2.1 サーバーで、
// AI は自分で登録し（動的クライアント登録）、本人が許可の画面
// （app/oauth/consent）で許すと、本人の JWT を受け取ってここを叩く。
//
// - 鍵が無い・正しくない要求には 401 と、認可の情報の在りか
//   （{resource}/oauth-protected-resource）を返す。AI はそれをたどって
//   Supabase で認可を取りに行く。
// - 要求ごとにサーバーを作り直す（Streamable HTTP の一番素直な形。状態を
//   持たないので Vercel の関数のまま動く）。
//
// 設計: docs/design/mcp.md

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// 場所を Google で引く鍵（Google マップの共有の受け口と同じもの）。
const placesApiKey = process.env.GOOGLE_PLACES_SERVER_API_KEY;

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const failure = (t: string) => ({ ...text(t), isError: true });

// 道具の分類（AI が確かめずに呼んでよいか等の判断に使う。MCP の tool annotations）。
const READ = { readOnlyHint: true, openWorldHint: false } as const;
const ADD = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;
const CHANGE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;
// 変える・消す道具の説明に添える。当てはまるものが複数ある時に、AI が勝手に
// 選ばず利用者に聞き返すように。
const PICK_HELP =
  "Use the id from get_trip. If the user's request could match more than one item, ask which one first. Fields you leave out stay as they are.";

// 書き込みの道具で共通の引数。
const tripId = z.string().describe("The trip id from list_trips.");
const isPrivate = z
  .boolean()
  .default(false)
  .describe("true = only the user can see it. Default false (shared with the trip members).");
const note = z.string().default("").describe("Optional note.");
const participants = z
  .union([z.literal("everyone"), z.array(z.string())])
  .default("everyone")
  .describe('"everyone", or member names from get_trip ("me" = the user).');
const placeRef = {
  place: z
    .string()
    .optional()
    .describe("A place name. Matches a place already in the trip by name; otherwise kept as a name only."),
  google_place_id: z
    .string()
    .optional()
    .describe("A Google place id from search_places. Preferred over place: it puts the place on the map."),
};
const OFFSET_TIME_HELP =
  "Local time at the place with its UTC offset, like 2027-08-11T12:00-10:00.";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// AI から見たこの入口の URL（lib/mcp-url.ts。案内のページと同じもの）。
function resourceServer(req: Request): string {
  return mcpUrl(new URL(req.url).origin);
}

const handle = pipeline(
  [
    withOAuthProtectedResource({
      resourceServer,
      authorizationServer: fromSupabaseUrl(supabaseUrl),
    }),
    withSupabase<Database>({
      auth: "user",
      issuer: fromSupabaseUrl(supabaseUrl),
      env: {
        url: supabaseUrl,
        publishableKeys: { default: anonKey },
        jwks: new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
      },
    }),
  ],
  async (req, { supabase, userClaims, jwtClaims }) => {
    // **AI に発行した鍵だけを通す。** MCP の仕様は、MCP サーバーが自分宛てに
    // 発行された鍵しか受け付けないことを求めている。この Supabase で OAuth の
    // クライアントに鍵を出すのは MCP のためだけなので、鍵に client_id（どの
    // OAuth のクライアントに出したか）が入っていることで見分ける。アプリの
    // 普段のログインの鍵には入っていない。
    // 401 には、前段（withOAuthProtectedResource）が認可の情報の在りかを付ける。
    if (typeof jwtClaims?.client_id !== "string") {
      return Response.json(
        { error: "invalid_token", error_description: "Not an MCP access token." },
        { status: 401 },
      );
    }
    const handler = createMcpHandler(
      () => {
        const server = new McpServer({ name: "triplot", version: "0.1.0" });

        server.registerTool(
          "list_trips",
          {
            description:
              "List the trips the signed-in user belongs to, newest first. Returns each trip's id, title, dates and settlement currency. Use get_trip with an id to read a trip's full contents.",
            inputSchema: z.object({}),
            annotations: READ,
          },
          async () => {
            const { trips, error } = await fetchMyTrips(
              supabase,
              userClaims!.id,
            );
            if (error) throw new Error(error.message);
            const text =
              trips.length === 0
                ? "No trips."
                : trips
                    .map(
                      (t) =>
                        `- ${t.title} (id: ${t.id}) — ${t.start_date ?? "?"} – ${t.end_date ?? "?"}, ${t.default_currency}`,
                    )
                    .join("\n");
            return { content: [{ type: "text", text }] };
          },
        );

        server.registerTool(
          "get_trip",
          {
            description:
              "Read everything in one trip as Markdown: schedule (events and transit), places (decided and candidates), expenses (who paid, how it is split), to-dos and notes. The data is always current, so call this again after the user changes the trip.",
            inputSchema: z.object({ trip_id: tripId }),
            annotations: READ,
          },
          async ({ trip_id }) => {
            const rows = await fetchTripDetailRows(supabase, trip_id);
            if (!rows.trip) {
              return {
                content: [{ type: "text", text: "Trip not found." }],
                isError: true,
              };
            }
            return { content: [{ type: "text", text: tripForAi(rows) }] };
          },
        );

        // 書き込みは、旅行の中身を読んで変換の材料を揃えてから行う。
        const withTrip = async (
          id: string,
          run: (ctx: AiTripContext) => Promise<{ ok: true; data: string } | { ok: false; error: string }>,
        ) => {
          const ctx = await loadAiTripContext(supabase, id, userClaims!.id);
          if (!ctx.ok) return failure(ctx.error);
          const r = await run(ctx.data);
          return r.ok ? text(r.data) : failure(r.error);
        };

        server.registerTool(
          "search_places",
          {
            description:
              "Search Google for places near the trip. Returns candidates with a google_place_id to pass to add_place, add_event, add_transit or add_expense. Include the area in the query when it helps (e.g. \"Hanauma Bay Oahu\").",
            inputSchema: z.object({ trip_id: tripId, query: z.string() }),
            annotations: { ...READ, openWorldHint: true },
          },
          async ({ trip_id, query }) => {
            if (!placesApiKey) return failure("Place search is not available right now.");
            const ctx = await loadAiTripContext(supabase, trip_id, userClaims!.id);
            if (!ctx.ok) return failure(ctx.error);
            const found = await aiSearchPlaces(ctx.data, query, placesApiKey).catch(
              () => null,
            );
            if (!found) return failure("Place search failed. Try again.");
            if (found.length === 0) return text("No places found.");
            return text(
              found
                .slice(0, 8)
                .map(
                  (c) =>
                    `- ${c.name} — ${c.formattedAddress}${c.rating ? ` — rating ${c.rating} (${c.userRatingCount ?? 0})` : ""} — google_place_id: ${c.placeId}`,
                )
                .join("\n"),
            );
          },
        );

        server.registerTool(
          "add_place",
          {
            description:
              "Add a place to the trip's map. Get the google_place_id from search_places first. Candidates are places the group is still considering; decided places are confirmed.",
            inputSchema: z.object({
              trip_id: tripId,
              google_place_id: z.string(),
              decided: z
                .boolean()
                .default(false)
                .describe("false = a candidate (default), true = decided."),
              note,
              private: isPrivate,
            }),
            annotations: ADD,
          },
          async (a) =>
            withTrip(a.trip_id, (ctx) =>
              aiAddPlace(
                supabase,
                ctx,
                {
                  googlePlaceId: a.google_place_id,
                  decided: a.decided,
                  note: a.note,
                  private: a.private,
                },
                placesApiKey,
              ),
            ),
        );

        server.registerTool(
          "add_todo",
          {
            description: "Add a to-do to the trip.",
            inputSchema: z.object({
              trip_id: tripId,
              title: z.string(),
              priority: z.enum(["high", "medium", "low"]).default("medium"),
              when: z
                .enum(["before_trip", "during_trip"])
                .default("before_trip")
                .describe("before_trip = preparation (bookings, packing). during_trip = things to do there."),
              private: isPrivate,
            }),
            annotations: ADD,
          },
          async (a) =>
            withTrip(a.trip_id, (ctx) =>
              aiAddTodo(supabase, ctx, {
                title: a.title,
                priority: a.priority,
                when: a.when,
                private: a.private,
              }),
            ),
        );

        server.registerTool(
          "add_event",
          {
            description:
              "Add an event to the schedule (a meal, a sightseeing spot, a hotel stay…). For a timed event give start and end as local times with the UTC offset of the place; the offset is checked against where the trip is that day, and a mismatch is refused with the expected offset. For an all-day event give all_day_start_date (and all_day_end_date) instead. Travel between places in different time zones is add_transit.",
            inputSchema: z.object({
              trip_id: tripId,
              title: z.string(),
              start: z.string().optional().describe(OFFSET_TIME_HELP),
              end: z.string().optional().describe(OFFSET_TIME_HELP),
              all_day_start_date: z
                .string()
                .optional()
                .describe("For an all-day event, like 2027-08-11."),
              all_day_end_date: z
                .string()
                .optional()
                .describe("Last day of an all-day event (inclusive). Defaults to the start date."),
              ...placeRef,
              participants,
              note,
              private: isPrivate,
              needs_reservation: z
                .boolean()
                .default(false)
                .describe("true adds a reservation to-do for it."),
            }),
            annotations: ADD,
          },
          async (a) =>
            withTrip(a.trip_id, (ctx) =>
              aiAddEvent(
                supabase,
                ctx,
                {
                  title: a.title,
                  start: a.start,
                  end: a.end,
                  allDayStartDate: a.all_day_start_date,
                  allDayEndDate: a.all_day_end_date,
                  place: { place: a.place, googlePlaceId: a.google_place_id },
                  participants: a.participants,
                  note: a.note,
                  private: a.private,
                  needsReservation: a.needs_reservation,
                },
                placesApiKey,
              ),
            ),
        );

        const transitEnd = z.object({
          time: z.string().describe(OFFSET_TIME_HELP),
          time_zone: z
            .string()
            .describe("IANA time zone of this end, like Asia/Tokyo or Pacific/Honolulu."),
          ...placeRef,
        });
        server.registerTool(
          "add_transit",
          {
            description:
              "Add travel between two places (a flight, train, ferry…). Each end has its own local time, UTC offset and IANA time zone. Flights that cross time zones are what tell triplot where the trip is on each day.",
            inputSchema: z.object({
              trip_id: tripId,
              title: z.string().describe("e.g. the flight number and route."),
              depart: transitEnd,
              arrive: transitEnd,
              participants,
              note,
              private: isPrivate,
              needs_reservation: z.boolean().default(false),
            }),
            annotations: ADD,
          },
          async (a) =>
            withTrip(a.trip_id, (ctx) =>
              aiAddTransit(
                supabase,
                ctx,
                {
                  title: a.title,
                  depart: {
                    time: a.depart.time,
                    timeZone: a.depart.time_zone,
                    place: a.depart.place,
                    googlePlaceId: a.depart.google_place_id,
                  },
                  arrive: {
                    time: a.arrive.time,
                    timeZone: a.arrive.time_zone,
                    place: a.arrive.place,
                    googlePlaceId: a.arrive.google_place_id,
                  },
                  participants: a.participants,
                  note: a.note,
                  private: a.private,
                  needsReservation: a.needs_reservation,
                },
                placesApiKey,
              ),
            ),
        );

        server.registerTool(
          "add_expense",
          {
            description:
              "Record an expense: who paid, how much, and who shares it. Amounts are in the currency paid; the rate to the trip's settlement currency is taken from rate_to_settlement_currency, else the trip's earlier expenses in that currency, else that day's exchange rate.",
            inputSchema: z.object({
              trip_id: tripId,
              amount: z.number().positive(),
              currency: z.string().describe("3-letter code, like USD."),
              rate_to_settlement_currency: z.number().positive().optional(),
              paid_at: z
                .string()
                .optional()
                .describe(`When it was paid. ${OFFSET_TIME_HELP}`),
              paid_on: z
                .string()
                .optional()
                .describe("The date only (like 2027-08-11), when the time is unknown."),
              category: z
                .string()
                .optional()
                .describe("A category name from get_trip. Omit if unsure."),
              payer: z.string().default("me").describe('Member name ("me" = the user).'),
              split: z
                .union([z.literal("everyone"), z.literal("none"), z.array(z.string())])
                .default("everyone")
                .describe('"everyone", "none" (not split), or member names.'),
              ...placeRef,
              note,
              private: isPrivate,
            }),
            annotations: ADD,
          },
          async (a) =>
            withTrip(a.trip_id, (ctx) =>
              aiAddExpense(
                supabase,
                ctx,
                {
                  amount: a.amount,
                  currency: a.currency,
                  rateToSettlementCurrency: a.rate_to_settlement_currency,
                  paidAt: a.paid_at,
                  paidOn: a.paid_on,
                  category: a.category,
                  payer: a.payer,
                  split: a.split,
                  place: { place: a.place, googlePlaceId: a.google_place_id },
                  note: a.note,
                  private: a.private,
                },
                placesApiKey,
              ),
            ),
        );

        server.registerTool(
          "update_event",
          {
            description: `Change an event (not a transit; use update_transit for those). ${PICK_HELP} Times work as in add_event: local time with the UTC offset. Sending only start keeps the length.`,
            inputSchema: z.object({
              trip_id: tripId,
              id: z.string(),
              title: z.string().optional(),
              start: z.string().optional().describe(OFFSET_TIME_HELP),
              end: z.string().optional().describe(OFFSET_TIME_HELP),
              all_day_start_date: z.string().optional(),
              all_day_end_date: z.string().optional(),
              ...placeRef,
              participants: participants.optional(),
              note: z.string().optional(),
              private: z.boolean().optional(),
              needs_reservation: z.boolean().optional(),
            }),
            annotations: CHANGE,
          },
          async (a) =>
            withTrip(a.trip_id, (ctx) =>
              aiUpdateEvent(
                supabase,
                ctx,
                {
                  id: a.id,
                  title: a.title,
                  start: a.start,
                  end: a.end,
                  allDayStartDate: a.all_day_start_date,
                  allDayEndDate: a.all_day_end_date,
                  place: { place: a.place, googlePlaceId: a.google_place_id },
                  participants: a.participants,
                  note: a.note,
                  private: a.private,
                  needsReservation: a.needs_reservation,
                },
                placesApiKey,
              ),
            ),
        );

        server.registerTool(
          "update_transit",
          {
            description: `Change a transit (flight, train…). ${PICK_HELP} An end you send replaces that end's time and time zone.`,
            inputSchema: z.object({
              trip_id: tripId,
              id: z.string(),
              title: z.string().optional(),
              depart: transitEnd.optional(),
              arrive: transitEnd.optional(),
              participants: participants.optional(),
              note: z.string().optional(),
              private: z.boolean().optional(),
              needs_reservation: z.boolean().optional(),
            }),
            annotations: CHANGE,
          },
          async (a) =>
            withTrip(a.trip_id, (ctx) =>
              aiUpdateTransit(
                supabase,
                ctx,
                {
                  id: a.id,
                  title: a.title,
                  depart: a.depart && {
                    time: a.depart.time,
                    timeZone: a.depart.time_zone,
                    place: a.depart.place,
                    googlePlaceId: a.depart.google_place_id,
                  },
                  arrive: a.arrive && {
                    time: a.arrive.time,
                    timeZone: a.arrive.time_zone,
                    place: a.arrive.place,
                    googlePlaceId: a.arrive.google_place_id,
                  },
                  participants: a.participants,
                  note: a.note,
                  private: a.private,
                  needsReservation: a.needs_reservation,
                },
                placesApiKey,
              ),
            ),
        );

        server.registerTool(
          "update_place",
          {
            description: `Change a place: decided or candidate, note, private. ${PICK_HELP}`,
            inputSchema: z.object({
              trip_id: tripId,
              id: z.string(),
              decided: z.boolean().optional(),
              note: z.string().optional(),
              private: z.boolean().optional(),
            }),
            annotations: CHANGE,
          },
          async (a) =>
            withTrip(a.trip_id, (ctx) =>
              aiUpdatePlace(supabase, ctx, {
                id: a.id,
                decided: a.decided,
                note: a.note,
                private: a.private,
              }),
            ),
        );

        server.registerTool(
          "update_todo",
          {
            description: `Change a to-do, or check it off for the user (done is recorded per person). ${PICK_HELP}`,
            inputSchema: z.object({
              trip_id: tripId,
              id: z.string(),
              title: z.string().optional(),
              priority: z.enum(["high", "medium", "low"]).optional(),
              when: z.enum(["before_trip", "during_trip"]).optional(),
              done: z.boolean().optional().describe("Check off (true) or uncheck (false) for the user."),
            }),
            annotations: CHANGE,
          },
          async (a) =>
            withTrip(a.trip_id, (ctx) =>
              aiUpdateTodo(supabase, ctx, {
                id: a.id,
                title: a.title,
                priority: a.priority,
                when: a.when,
                done: a.done,
              }),
            ),
        );

        server.registerTool(
          "update_expense",
          {
            description: `Change an expense. ${PICK_HELP} Times work as in add_expense.`,
            inputSchema: z.object({
              trip_id: tripId,
              id: z.string(),
              amount: z.number().positive().optional(),
              currency: z.string().optional(),
              rate_to_settlement_currency: z.number().positive().optional(),
              paid_at: z.string().optional().describe(OFFSET_TIME_HELP),
              paid_on: z.string().optional(),
              category: z.string().optional(),
              payer: z.string().optional(),
              split: z
                .union([z.literal("everyone"), z.literal("none"), z.array(z.string())])
                .optional(),
              ...placeRef,
              note: z.string().optional(),
              private: z.boolean().optional(),
            }),
            annotations: CHANGE,
          },
          async (a) =>
            withTrip(a.trip_id, (ctx) =>
              aiUpdateExpense(
                supabase,
                ctx,
                {
                  id: a.id,
                  amount: a.amount,
                  currency: a.currency,
                  rateToSettlementCurrency: a.rate_to_settlement_currency,
                  paidAt: a.paid_at,
                  paidOn: a.paid_on,
                  category: a.category,
                  payer: a.payer,
                  split: a.split,
                  place: { place: a.place, googlePlaceId: a.google_place_id },
                  note: a.note,
                  private: a.private,
                },
                placesApiKey,
              ),
            ),
        );

        server.registerTool(
          "delete_item",
          {
            description:
              "Delete an event (or transit), place, to-do or expense. Use the id from get_trip. If the user's request could match more than one item, ask which one first. The reply contains what was deleted, so it can be added again if the user changes their mind.",
            inputSchema: z.object({
              trip_id: tripId,
              type: z.enum(["event", "place", "todo", "expense"]),
              id: z.string(),
            }),
            annotations: { ...CHANGE, idempotentHint: false },
          },
          async (a) =>
            withTrip(a.trip_id, (ctx) =>
              aiDeleteItem(supabase, ctx, { type: a.type, id: a.id }),
            ),
        );

        return server;
      },
      { onerror: (error) => console.error("[mcp] request failed", error) },
    );
    return handler.fetch(req);
  },
);

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export const OPTIONS = handle;
