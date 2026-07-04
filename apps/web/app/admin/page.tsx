import { getLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";

import { formatDayLabel } from "@triplot/shared/schedule";

import { InlineDivider } from "@/components/inline-divider";
import { isAllowedReceiptHost } from "@/lib/import/links";
import { createClient } from "@/lib/supabase/server";

// サイト管理者専用の管理ページ。初出のビューは「明細リンクの候補ホスト昇格」:
// receipt_link_candidates を出現回数順に眺め、本物のレシート基盤を
// RECEIPT_LINK_HOSTS（コード定数）に PR で昇格させる判断材料にする。
// 昇格の操作自体はこの画面には無い（コード変更＝PR レビューがゲート）。
export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // 非 admin にはページの存在自体を見せない（メニューにも出ないので 404 で隠す）。
  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) notFound();

  // RLS の receipt_link_candidates_admin_select（is_app_admin()）で admin だけ読める。
  const { data: candidates } = await supabase
    .from("receipt_link_candidates")
    .select("host, seen_count, sample_url, last_seen")
    .order("seen_count", { ascending: false })
    .order("last_seen", { ascending: false });

  const [t, locale] = await Promise.all([getTranslations("admin"), getLocale()]);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{t("heading")}</h1>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("candidatesHeading")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("candidatesDescription")}
        </p>

        {(candidates ?? []).length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">{t("emptyState")}</p>
        ) : (
          <ul className="mt-4 divide-y divide-foreground/10">
            {(candidates ?? []).map((c) => (
              <li key={c.host} className="py-3">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 truncate text-sm font-medium text-foreground">
                    {c.host}
                  </span>
                  {isAllowedReceiptHost(c.host) && (
                    <span className="shrink-0 rounded bg-muted px-1.5 text-xs text-muted-foreground">
                      {t("promoted")}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  <span className="shrink-0 tabular-nums">
                    {t("seenCount", { count: c.seen_count })}
                  </span>
                  <InlineDivider />
                  <span className="shrink-0">
                    {t("lastSeen", {
                      date: formatDayLabel(c.last_seen.slice(0, 10), locale),
                    })}
                  </span>
                  {c.sample_url && (
                    <>
                      <InlineDivider />
                      <span className="truncate">{c.sample_url}</span>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
