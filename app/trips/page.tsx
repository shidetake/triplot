import Link from "next/link";
import { redirect } from "next/navigation";

import { CreateTripButton } from "@/components/create-trip-button";
import { createClient } from "@/lib/supabase/server";

// アプリのホーム = 旅行一覧（要ログイン）。未ログインは LP（/）へ。
export default async function TripsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <div className="space-y-8">
        <CreateTripSection userId={user.id} />

        <TripList userId={user.id} />
      </div>
    </main>
  );
}

// 作成ボタン＋コピー元候補（自分が在籍中の trip）を渡す。
// 旅行作成フォームの既定の表示名 = 保存済みの display_name。サインアップ時に Google 名の
// 先頭トークンだけを保存しているので、ここでは切り出さずそのまま使う（設定で編集可）。
async function CreateTripSection({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("users").select("display_name").eq("id", userId).single(),
    supabase
      .from("trip_members")
      .select("trips(id, title, default_currency, start_date, end_date)")
      .eq("user_id", userId)
      .is("left_at", null)
      .order("joined_at", { ascending: false }),
  ]);
  const defaultDisplayName = profile?.display_name?.trim() || null;

  const trips = (memberships ?? [])
    .map((m) => m.trips)
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .map((t) => ({
      id: t.id,
      title: t.title,
      default_currency: t.default_currency,
      start_date: t.start_date,
      end_date: t.end_date,
    }));

  return (
    <CreateTripButton defaultDisplayName={defaultDisplayName} trips={trips} />
  );
}

async function TripList({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data: memberships, error } = await supabase
    .from("trip_members")
    .select("trip_id, trips(id, title, start_date, end_date)")
    .eq("user_id", userId)
    .is("left_at", null)
    .order("joined_at", { ascending: false });

  if (error) {
    return (
      <p className="text-sm text-red-600">
        旅行一覧の取得に失敗しました: {error.message}
      </p>
    );
  }

  const trips = (memberships ?? [])
    .map((m) => m.trips)
    .filter((t): t is NonNullable<typeof t> => t !== null);

  if (trips.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        まだ参加している旅行はありません。
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {trips.map((trip) => (
        <li key={trip.id}>
          <Link
            href={`/trips/${trip.id}`}
            className="block rounded-md border border-zinc-200 p-4 transition hover:border-zinc-400 hover:bg-zinc-50"
          >
            <div className="font-medium">{trip.title}</div>
            <div className="mt-1 text-sm text-zinc-500">
              {trip.start_date ?? "?"} 〜 {trip.end_date ?? "?"}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
