import Link from "next/link";

import { CreateTripButton } from "@/components/create-trip-button";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { SignOutButton } from "@/components/sign-out-button";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 旅行作成フォームの表示名デフォルト。
  // 既存データ優先: 直近に参加した旅行で使った表示名（最新の在籍旅行）。
  // 無ければ完全デフォルト: Google の given_name（名）→ users.display_name の
  // 先頭トークン（半角/全角スペース区切り）にフォールバックして短くする。
  let defaultDisplayName: string | null = null;
  if (user) {
    const { data: lastMember } = await supabase
      .from("trip_members")
      .select("display_name")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastMember?.display_name) {
      defaultDisplayName = lastMember.display_name;
    } else {
      const { data: profile } = await supabase
        .from("users")
        .select("display_name")
        .eq("id", user.id)
        .single();
      const given = (
        user.user_metadata?.given_name as string | undefined
      )?.trim();
      const firstToken = (profile?.display_name ?? "")
        .trim()
        .split(/[\s　]+/)[0];
      defaultDisplayName = given || firstToken || null;
    }
  }

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

          <CreateTripSection userId={user.id} defaultDisplayName={defaultDisplayName} />

          <TripList userId={user.id} />
        </section>
      )}
    </main>
  );
}

// 作成ボタン＋コピー元候補（自分が在籍中の trip）を渡す。
async function CreateTripSection({
  userId,
  defaultDisplayName,
}: {
  userId: string;
  defaultDisplayName: string | null;
}) {
  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from("trip_members")
    .select("trips(id, title, default_currency)")
    .eq("user_id", userId)
    .is("left_at", null)
    .order("joined_at", { ascending: false });

  const trips = (memberships ?? [])
    .map((m) => m.trips)
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .map((t) => ({
      id: t.id,
      title: t.title,
      default_currency: t.default_currency,
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
