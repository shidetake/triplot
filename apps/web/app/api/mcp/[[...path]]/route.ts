import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { pipeline } from "@supabase/middleware";
import {
  fromSupabaseUrl,
  withOAuthProtectedResource,
  withSupabase,
} from "@supabase/server";
import { z } from "zod";

import { fetchTripDetailRows } from "@triplot/shared/data/reads/tripDetail";
import { fetchMyTrips } from "@triplot/shared/data/reads/trips";
import { tripForAi } from "@triplot/shared/tripForAi";
import type { Database } from "@triplot/shared/types/database";

// AI（Claude・ChatGPT・Gemini 等）が旅行を読む入口（MCP サーバー）。
// AI は旅行のメンバーにはならず、**ログインした本人の代理**として本人の権限で
// 読む（RLS がそのまま効く）。認可は Supabase Auth の OAuth 2.1 サーバーで、
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
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// AI から見たこの入口の URL。本番はこの web そのもの。staging は web が
// Vercel の保護の内側にあって外の AI から届かないので、Supabase の Edge
// Function（mcp）が中継し、その URL を MCP_RESOURCE_URL に置く。
function resourceServer(req: Request): string {
  return process.env.MCP_RESOURCE_URL ?? `${new URL(req.url).origin}/api/mcp`;
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
            inputSchema: z.object({
              trip_id: z.string().describe("The trip id from list_trips."),
            }),
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
