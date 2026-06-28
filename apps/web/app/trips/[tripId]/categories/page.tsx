import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { ChevronIcon } from "@/components/icons";
import { CategoryManagementList } from "@/components/category-management-list";

export default async function CategoriesPage({
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

  const [{ data: trip }, { data: categoriesRaw }, { data: me }] =
    await Promise.all([
      supabase.from("trips").select("id, title").eq("id", tripId).single(),
      supabase
        .from("expense_categories")
        .select("id, name, color, icon, sort_order, key")
        .eq("trip_id", tripId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("trip_members")
        .select("id")
        .eq("trip_id", tripId)
        .eq("user_id", user.id)
        .is("left_at", null)
        .maybeSingle(),
    ]);

  if (!trip || !me) notFound();

  const t = await getTranslations("categories");

  const categories = (categoriesRaw ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    icon: c.icon,
    key: (c as { key?: string | null }).key ?? null,
  }));

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

      <h1 className="text-2xl font-semibold">{t("heading")}</h1>

      <div className="mt-6">
        <CategoryManagementList tripId={tripId} categories={categories} />
      </div>
    </main>
  );
}
