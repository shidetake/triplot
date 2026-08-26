import type { DB } from "../client";
import { compareTripOrder } from "../../tripOrder";

// 旅行一覧（アプリのホーム）の読み取り。web（apps/web/app/trips/page.tsx）から
// 移設（クエリは挙動不変）。RN の旅行一覧も同じ関数を使う。
export async function fetchMyTrips(sb: DB, userId: string) {
  const { data: memberships, error } = await sb
    .from("trip_members")
    .select("trips(id, title, default_currency, start_date, end_date)")
    .eq("user_id", userId)
    .is("left_at", null)
    // 並び替えはこの後 JS でやる（旅行の開始日で並べたいが、参照先の列での
    // 並び替えは PostgREST の埋め込みリソースの扱いに依存するため）。
    .order("joined_at", { ascending: false });

  // 並び順のルールと理由は compareTripOrder（開始日の新しい順）。
  const trips = (memberships ?? [])
    .map((m) => m.trips)
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .sort((a, b) =>
      compareTripOrder(
        { start: a.start_date, title: a.title },
        { start: b.start_date, title: b.title },
      ),
    );

  return { trips, error };
}

export type TripSummary = Awaited<
  ReturnType<typeof fetchMyTrips>
>["trips"][number];

// 自分のプロフィール（表示名・アバター）。旅行作成フォームの初期値と
// 設定画面のアバター表示に使う。
export async function fetchUserProfile(sb: DB, userId: string) {
  const { data } = await sb
    .from("users")
    .select("display_name, avatar_url")
    .eq("id", userId)
    .single();
  return data;
}
