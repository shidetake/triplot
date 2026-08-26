import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CreateTripButton } from "@/components/create-trip-button";
import { InboxRealtime } from "@/components/inbox-realtime";
import { RefreshOnFocus } from "@/components/refresh-on-focus";
import { LoadError } from "@/components/load-error";
import {
  fetchMyTrips,
  fetchUserProfile,
} from "@triplot/shared/data/reads/trips";
import { fetchUnassignedDrafts } from "@triplot/shared/data/reads/inbox";
import {
  deriveTripProposals,
  tripProposalDefaults,
} from "@triplot/shared/import/tripProposal";
import { TripProposalCard } from "@/components/trip-proposal-card";
import { AppHeader } from "@/components/app-header";
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
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl px-6 py-10">
      {/* 他のメンバーが作った旅行・招待で増えた旅行を、戻ってきた時に拾う。 */}
      <RefreshOnFocus />
      <InboxRealtime userId={user.id} />
      <TripsSection userId={user.id} />
    </main>
    </>
  );
}

async function TripsSection({ userId }: { userId: string }) {
  // 読み取りクエリは shared（RN の旅行一覧と共用）。
  const supabase = await createClient();
  const [profile, { trips, error }, unassigned] = await Promise.all([
    fetchUserProfile(supabase, userId),
    fetchMyTrips(supabase, userId),
    fetchUnassignedDrafts(supabase, userId),
  ]);
  // まだ作っていない旅行の候補（移動・宿泊の未割り当ての下書きを日付でまとめたもの）。
  const proposals = deriveTripProposals(unassigned).map((p) => ({
    ...tripProposalDefaults(p),
    emailIds: p.emailIds,
  }));
  const defaultDisplayName = profile?.display_name?.trim() || null;

  const [t, locale] = await Promise.all([
    getTranslations("trips"),
    getLocale(),
  ]);

  if (error) {
    return <LoadError message={error.message} />;
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

      {trips.length === 0 && proposals.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      )}

      {/* 旅行の候補（仮旅行）は実在の旅行とは別のまとまりなので、同じ枠に
          入れず上に別立てで置く。仮であることは破線の器と見出しが群として
          示すので、中は区切り線だけの行にする（費用の「未確定の取り込み」と
          同じ形）。 */}
      {proposals.length > 0 && (
        <div className="rounded-md border border-dashed border-foreground/20 p-4">
          <div className="text-xs text-muted-foreground">
            {t("proposal", { count: proposals.length })}
          </div>
          <ul className="mt-2 divide-y divide-foreground/10">
            {proposals.map((p) => (
              <li key={p.emailIds.join(",")}>
              <TripProposalCard
                proposal={p}
                defaultDisplayName={defaultDisplayName}
                trips={trips.map((trip) => ({
                  id: trip.id,
                  title: trip.title,
                  default_currency: trip.default_currency,
                  start_date: trip.start_date,
                  end_date: trip.end_date,
                }))}
              />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 同種の項目が並ぶ一覧なので、1件ずつ枠＋隙間ではなく一覧全体を1つの枠に
          して行を区切り線で分ける（費用一覧・受信箱と同じ形）。 */}
      {trips.length > 0 && (
        <ul
          className={`divide-y divide-foreground/10 overflow-hidden rounded-md border border-foreground/10${
            proposals.length > 0 ? " mt-6" : ""
          }`}
        >
          {trips.map((trip) => (
            <li key={trip.id}>
              <Link
                href={`/trips/${trip.id}`}
                className="block p-4 transition hover:bg-foreground/10"
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
