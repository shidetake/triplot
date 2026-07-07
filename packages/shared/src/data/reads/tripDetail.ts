import type { DB } from "../client";

// 旅行詳細ページの読み取りクエリ一式。web（apps/web/app/trips/[tripId]/page.tsx）
// から移設したもので、select 文字列・ソート順はそのまま（挙動不変）。RN も
// 同じ関数を使う（docs/architecture.md の「読み取りも shared に降ろす」段）。
//
// 8 本とも tripId キーで互いに独立。RLS で保護されているので並列で叩く
// （直列だとクライアント→Supabase の RTT が 8 回積み上がる）。
export async function fetchTripDetailRows(sb: DB, tripId: string) {
  const [
    { data: trip, error: tripError },
    { data: members },
    { data: categoriesRaw },
    { data: expensesRaw },
    { data: placesRaw },
    { data: eventsRaw },
    { data: todosRaw },
    { data: pinOptionsRaw },
  ] = await Promise.all([
    sb
      .from("trips")
      .select(
        "id, title, start_date, end_date, default_currency, default_timezone",
      )
      .eq("id", tripId)
      .single(),
    sb
      .from("trip_members")
      .select(
        "id, user_id, display_name, kind, color, is_admin, users(avatar_url)",
      )
      .eq("trip_id", tripId)
      .is("left_at", null)
      .order("joined_at", { ascending: true }),
    sb
      .from("expense_categories")
      .select("id, name, color, icon, sort_order, key")
      .eq("trip_id", tripId)
      .order("sort_order", { ascending: true }),
    sb
      .from("expenses")
      .select(
        "id, local_price, local_currency, rate_to_default, category_id, visibility, splittable, note, paid_at, tz_disambig_transit_id, tz_disambig_side, created_at, payer_member_id, created_by_member_id, place_id, expense_splits(member_id)",
      )
      .eq("trip_id", tripId)
      // 発生順の確定はアプリ側（resolveEventTz で解決したTZ + paid_at から
      // 都度算出、tripDerive.deriveOrderedExpenses 参照）。ここでは安定した
      // 基準順だけ与える。
      .order("created_at", { ascending: true }),
    sb
      .from("places")
      .select(
        "id, name, lat, lng, google_place_id, formatted_address, region, locality, tentative, visibility, note, icon, created_by_member_id, created_at",
      )
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false }),
    sb
      .from("events")
      .select(
        "id, title, kind, all_day, start_at, end_at, start_tz, end_tz, tz_disambig_transit_id, tz_disambig_side, place_id, visibility, note, created_by_member_id, created_at, event_participants(member_id)",
      )
      .eq("trip_id", tripId)
      .order("start_at", { ascending: true }),
    sb
      .from("todos")
      .select(
        "id, title, priority, done, created_at, created_by_member_id, kind, event_id, visibility, todo_likes(member_id)",
      )
      .eq("trip_id", tripId)
      // 表示順は todoSort（優先度→作成順）でアプリ側に統一。
      .order("created_at", { ascending: true }),
    sb
      .from("trip_pin_options")
      .select("id, icon, label, sort_order")
      .eq("trip_id", tripId)
      .order("sort_order", { ascending: true }),
  ]);

  return {
    trip,
    tripError,
    members,
    categoriesRaw,
    expensesRaw,
    placesRaw,
    eventsRaw,
    todosRaw,
    pinOptionsRaw,
  };
}

export type TripDetailRows = Awaited<ReturnType<typeof fetchTripDetailRows>>;
