import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ChevronIcon } from "@/components/icons";
import { MembersManagementList } from "@/components/members-management-list";
import { createClient } from "@/lib/supabase/server";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: trip }, { data: membersRaw }] = await Promise.all([
    supabase.from("trips").select("id, title").eq("id", tripId).single(),
    supabase
      .from("trip_members")
      .select("id, user_id, display_name, color, is_admin, joined_at, kind")
      .eq("trip_id", tripId)
      .is("left_at", null)
      .order("joined_at", { ascending: true }),
  ]);

  if (!trip) notFound();
  const members = membersRaw ?? [];
  const me = members.find((m) => m.user_id === user.id);
  if (!me) notFound();

  const t = await getTranslations("members");

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <div className="mb-6">
        <Link
          href={`/trips/${tripId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ChevronIcon size={16} className="rotate-180" />
          {trip.title}
        </Link>
      </div>

      <header className="mb-4">
        <h1 className="text-2xl font-semibold">{t("heading")}</h1>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("editOwnName")}
          {me.is_admin ? t("adminCanRemove") : t("onlyAdminCanRemove")}
        </p>
      </header>

      <MembersManagementList
        tripId={tripId}
        members={members.map((m) => ({
          id: m.id,
          display_name: m.display_name,
          color: m.color,
          is_admin: m.is_admin,
        }))}
        myMemberId={me.id}
        iAmAdmin={me.is_admin}
      />
    </main>
  );
}
