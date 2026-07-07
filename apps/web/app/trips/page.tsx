import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CreateTripButton } from "@/components/create-trip-button";
import {
  fetchMyTrips,
  fetchUserProfile,
} from "@triplot/shared/data/reads/trips";
import { createClient } from "@/lib/supabase/server";
import { formatTripDateRange } from "@triplot/shared/ymd";

// アプリのホーム = 旅行一覧（要ログイン）。未ログインは LP（/）へ。
export default async function TripsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <TripsSection userId={user.id} />
    </main>
  );
}

async function TripsSection({ userId }: { userId: string }) {
  // 読み取りクエリは shared（RN の旅行一覧と共用）。
  const supabase = await createClient();
  const [profile, { trips, error }] = await Promise.all([
    fetchUserProfile(supabase, userId),
    fetchMyTrips(supabase, userId),
  ]);
  const defaultDisplayName = profile?.display_name?.trim() || null;

  const [t, locale] = await Promise.all([
    getTranslations("trips"),
    getLocale(),
  ]);

  if (error) {
    return (
      <p className="text-sm text-red-600">
        {t("loadError", { message: error.message })}
      </p>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("heading")}</h2>
        <CreateTripButton
          defaultDisplayName={defaultDisplayName}
          trips={trips.map((trip) => ({
            id: trip.id,
            title: trip.title,
            default_currency: trip.default_currency,
            start_date: trip.start_date,
            end_date: trip.end_date,
          }))}
        />
      </div>

      {trips.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-2">
          {trips.map((trip) => (
            <li key={trip.id}>
              <Link
                href={`/trips/${trip.id}`}
                className="block rounded-md border border-foreground/10 p-4 transition hover:border-foreground/40 hover:bg-foreground/10"
              >
                <div className="font-medium">{trip.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {formatTripDateRange(trip.start_date, trip.end_date, locale)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
