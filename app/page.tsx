import Link from "next/link";

import { AccountMenu } from "@/components/account-menu";
import { CreateTripButton } from "@/components/create-trip-button";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { InboxIcon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 旅行作成フォームの既定の表示名 = 保存済みの display_name。サインアップ時に Google 名の
  // 先頭トークンだけを保存しているので、ここでは切り出さずそのまま使う（設定で編集可）。
  // あわせてカスタムアバター（avatar_url）も取得する。
  let defaultDisplayName: string | null = null;
  let customAvatar: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .single();
    defaultDisplayName = profile?.display_name?.trim() || null;
    customAvatar = profile?.avatar_url ?? null;
  }

  // 実効アバター: カスタム > Google の写真。
  const avatarUrl =
    customAvatar ??
    (user?.user_metadata?.avatar_url as string | undefined) ??
    (user?.user_metadata?.picture as string | undefined) ??
    null;
  const accountName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    defaultDisplayName;

  // 受信箱バッジ: まだ旅行に割り当てていない下書きの件数（要割当）。
  let inboxCount = 0;
  if (user) {
    const { count } = await supabase
      .from("inbound_emails")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "extracted")
      .is("trip_id", null);
    inboxCount = count ?? 0;
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">triplot</h1>
          <p className="mt-2 text-sm text-zinc-600">
            友達と旅行プランを立てて、思い出として残す。
          </p>
        </div>
        {user && (
          <div className="flex shrink-0 items-center gap-3">
            <Link
              href="/import"
              aria-label={
                inboxCount > 0 ? `取り込み（未割当 ${inboxCount} 件）` : "取り込み"
              }
              title={
                inboxCount > 0 ? `取り込み（未割当 ${inboxCount} 件）` : "取り込み"
              }
              className="relative flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
            >
              <InboxIcon size={24} />
              {inboxCount > 0 && (
                <span className="absolute right-0 top-0 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-zinc-900 px-1 text-[9px] font-semibold leading-none text-white ring-1 ring-white">
                  {inboxCount > 9 ? "9+" : inboxCount}
                </span>
              )}
            </Link>
            <AccountMenu
              email={user.email ?? null}
              name={accountName}
              avatarUrl={avatarUrl}
            />
          </div>
        )}
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
    .select("trips(id, title, default_currency, start_date, end_date)")
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
