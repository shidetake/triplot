import Link from "next/link";

import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { SignOutButton } from "@/components/sign-out-button";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">triplot</h1>
        <p className="mt-2 text-sm text-zinc-600">
          友達と旅行プランを立てて、思い出として残す。
        </p>
      </header>

      {!user ? (
        <section className="mt-12 space-y-4">
          <GoogleSignInButton />
          <p className="text-sm text-zinc-500">
            ログイン不要で参加だけしたい場合は、共有リンクから直接アクセスしてください。
          </p>
        </section>
      ) : (
        <section className="mt-12 space-y-8">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-600">
              ログイン中: {user.email ?? "(匿名)"}
            </p>
            <SignOutButton />
          </div>

          <Link
            href="/trips/new"
            className="inline-flex h-12 items-center justify-center rounded-md bg-black px-6 font-medium text-white transition hover:bg-zinc-800"
          >
            新しい旅行を作る
          </Link>

          <TripList userId={user.id} />
        </section>
      )}
    </main>
  );
}

async function TripList({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data: memberships, error } = await supabase
    .from("trip_members")
    .select("trip_id, trips(id, title, start_date, end_date, status)")
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
              <span className="ml-2 inline-flex items-center rounded bg-zinc-100 px-2 text-xs text-zinc-600">
                {trip.status}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
