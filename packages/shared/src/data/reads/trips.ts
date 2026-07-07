import type { DB } from "../client";

// 旅行一覧（アプリのホーム）の読み取り。web（apps/web/app/trips/page.tsx）から
// 移設（クエリは挙動不変）。RN の旅行一覧も同じ関数を使う。
export async function fetchMyTrips(sb: DB, userId: string) {
  const { data: memberships, error } = await sb
    .from("trip_members")
    .select("trips(id, title, default_currency, start_date, end_date)")
    .eq("user_id", userId)
    .is("left_at", null)
    .order("joined_at", { ascending: false });

  const trips = (memberships ?? [])
    .map((m) => m.trips)
    .filter((t): t is NonNullable<typeof t> => t !== null);

  return { trips, error };
}

export type TripSummary = Awaited<
  ReturnType<typeof fetchMyTrips>
>["trips"][number];

// 自分のプロフィール（表示名）。旅行作成フォームの初期値に使う。
export async function fetchUserProfile(sb: DB, userId: string) {
  const { data } = await sb
    .from("users")
    .select("display_name")
    .eq("id", userId)
    .single();
  return data;
}
