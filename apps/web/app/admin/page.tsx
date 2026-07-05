import { getLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";

import { formatDayLabel } from "@triplot/shared/schedule";

import { FeedbackStatusButton } from "@/components/feedback-status-button";
import { InlineDivider } from "@/components/inline-divider";
import { isAllowedReceiptHost } from "@/lib/import/links";
import { createClient } from "@/lib/supabase/server";

import { updateFeedbackStatusAction } from "./actions";

// サイト管理者専用の管理ページ。ビューは2つ:
//  - 明細リンクの候補ホスト昇格: receipt_link_candidates を出現回数順に眺め、本物の
//    レシート基盤を RECEIPT_LINK_HOSTS（コード定数）に PR で昇格させる判断材料にする。
//    昇格の操作自体はこの画面には無い（コード変更＝PR レビューがゲート）。
//  - ユーザーフィードバック: 不具合報告・要望の一覧と対応状態の管理。
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
    .select("host, seen_count, sample_url, last_seen, skipped_unsubscribe")
    .order("seen_count", { ascending: false })
    .order("last_seen", { ascending: false });

  // フィードバック（RLS feedback_admin_select）。投稿者は users_admin_select で embed。
  const { data: feedbackRows } = await supabase
    .from("feedback")
    .select("id, kind, body, path, status, created_at, users(display_name)")
    .order("created_at", { ascending: false });

  const [t, tFeedback, locale] = await Promise.all([
    getTranslations("admin"),
    getTranslations("feedback"),
    getLocale(),
  ]);

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
                  {c.skipped_unsubscribe && (
                    <span className="shrink-0 rounded bg-amber-100 px-1.5 text-xs text-amber-700 dark:bg-amber-400/20 dark:text-amber-300">
                      {t("unsubscribeWarning")}
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

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("feedbackHeading")}</h2>

        {(feedbackRows ?? []).length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">
            {t("feedbackEmpty")}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-foreground/10">
            {(feedbackRows ?? []).map((f) => (
              <li
                key={f.id}
                // 対応済みは「状態としての dim」= opacity-50（ui-guidelines）。
                className={`flex items-start justify-between gap-3 py-3 ${
                  f.status === "done" ? "opacity-50" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`shrink-0 rounded px-1.5 text-xs ${
                        f.kind === "bug"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {f.kind === "bug"
                        ? tFeedback("kindBug")
                        : tFeedback("kindFeature")}
                    </span>
                    <span className="min-w-0 truncate text-xs text-muted-foreground">
                      {f.users?.display_name ?? "?"}
                    </span>
                    <InlineDivider />
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDayLabel(f.created_at.slice(0, 10), locale)}
                    </span>
                    {f.path && (
                      <>
                        <InlineDivider />
                        <span className="min-w-0 truncate text-xs text-muted-foreground">
                          {f.path}
                        </span>
                      </>
                    )}
                  </div>
                  {/* 本文は読むのが目的なので truncate しない（管理者向けの閲覧リスト）。 */}
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
                    {f.body}
                  </p>
                </div>
                <FeedbackStatusButton
                  id={f.id}
                  status={f.status as "open" | "done"}
                  action={updateFeedbackStatusAction}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
