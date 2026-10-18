import { getLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";

import { deriveNotes } from "@triplot/shared/notes";
import { formatTripDateRange } from "@triplot/shared/ymd";

import { AppHeader } from "@/components/app-header";
import { NoteEditor } from "@/components/note-editor";
import { createClient } from "@/lib/supabase/server";

// ノートのページ。noteId が "new" なら新しいノート。
// ノートは長い文章を読み書きする行き先なので、旅行の画面の上に重ねず
// ページとして開く（ui-guidelines「全画面表示を使う場面」）。戻ると旅行の
// 画面のノートのタブへ帰る。
export default async function NotePage({
  params,
}: {
  params: Promise<{ tripId: string; noteId: string }>;
}) {
  const { tripId, noteId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const isNew = noteId === "new";
  const [{ data: trip }, { data: members }, { data: notesRaw }, t, locale] =
    await Promise.all([
      supabase
        .from("trips")
        .select("title, start_date, end_date")
        .eq("id", tripId)
        .maybeSingle(),
      supabase
        .from("trip_members")
        .select("id, user_id, display_name, left_at")
        .eq("trip_id", tripId),
      isNew
        ? Promise.resolve({ data: [] })
        : supabase
            .from("notes")
            .select(
              "id, body, visibility, created_by_member_id, updated_at, locked_by_member_id, lock_expires_at",
            )
            .eq("trip_id", tripId)
            .eq("id", noteId),
      getTranslations("notes"),
      getLocale(),
    ]);

  if (!trip) notFound();
  const me = (members ?? []).find(
    (m) => m.user_id === user.id && m.left_at === null,
  );
  if (!me) notFound();
  const note = isNew ? null : (deriveNotes(notesRaw)[0] ?? null);
  if (!isNew && !note) notFound();

  return (
    <>
      <AppHeader
        trip={{
          title: trip.title,
          dateRange: formatTripDateRange(trip.start_date, trip.end_date, locale),
        }}
        back={{ href: `/trips/${tripId}?tab=notes#notes`, label: t("backToTrip") }}
      />
      <main className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6 md:py-10">
        <NoteEditor
          tripId={tripId}
          note={note}
          myMemberId={me.id}
          members={(members ?? []).map((m) => ({
            id: m.id,
            display_name: m.display_name,
          }))}
        />
      </main>
    </>
  );
}
