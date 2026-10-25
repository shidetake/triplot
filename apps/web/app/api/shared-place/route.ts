import { NextResponse } from "next/server";
import { z } from "zod";

import {
  addSharedPlace,
  fetchSharedPlaceTrips,
} from "@triplot/shared/data/sharedPlace";
import { resolveGoogleMapsShare } from "@triplot/shared/googleMapsShare";

import { resolveRequestUser } from "@/lib/supabase/request-user";

// Google マップの「共有」→ triplot の共有画面（iOS の拡張機能）の受け口。
// 共有画面は一覧を描いてボタンを押すだけで、判断はここと
// @triplot/shared/data/sharedPlace が持つ（Swift に同じ処理を二重に書かない）。
// iOS からは Supabase の Edge Function（shared-place）を中継して届く
// （staging の web にかかっている Vercel の保護を、アプリに鍵を持たせずに越えるため）。
//
//   GET  ?text=<共有されたテキスト>  → 場所と、選べる旅行の一覧
//   POST { tripId, place }          → その旅行に場所を足す

export async function GET(request: Request) {
  const resolved = await resolveRequestUser(request);
  if (!resolved) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { supabase, user } = resolved;

  const text = new URL(request.url).searchParams.get("text") ?? "";
  const apiKey = process.env.GOOGLE_PLACES_SERVER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "places unavailable" }, { status: 503 });
  }
  const place = await resolveGoogleMapsShare(text, { apiKey });
  if (!place) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const trips = await fetchSharedPlaceTrips(supabase, user.id, place.placeId);
  if (!trips.ok) {
    console.error("[shared-place] trips failed", trips.error);
    return NextResponse.json({ error: "read failed" }, { status: 500 });
  }
  return NextResponse.json({ place, trips: trips.data });
}

// GET で返した場所をそのまま送り返してもらう（Google を二度引かない）。
// 中身は利用者が送ってくる値だが、アプリの追加フォームも同じ値を自由に
// 送れるので、ここで信用しても書ける範囲は変わらない（書き込みは RLS と
// create_place が守る）。
const placeSchema = z.object({
  placeId: z.string().min(1),
  name: z.string().min(1),
  formattedAddress: z.string(),
  lat: z.number(),
  lng: z.number(),
  region: z.string().nullable(),
  locality: z.string().nullable(),
  rating: z.number().nullable(),
  userRatingCount: z.number().nullable(),
  primaryType: z.string().nullable(),
  googleMapsUri: z.string().nullable().optional(),
});
const postSchema = z.object({ tripId: z.string().min(1), place: placeSchema });

export async function POST(request: Request) {
  const resolved = await resolveRequestUser(request);
  if (!resolved) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const added = await addSharedPlace(
    resolved.supabase,
    parsed.data.tripId,
    parsed.data.place,
  );
  if (!added.ok) {
    console.error("[shared-place] add failed", added.error);
    return NextResponse.json({ error: "store failed" }, { status: 500 });
  }
  return NextResponse.json({ result: added.data });
}
