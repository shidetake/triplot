import { getLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";

import { formatDayLabel } from "@triplot/shared/schedule";

import { FeedbackStatusButton } from "@/components/feedback-status-button";
import { InlineDivider } from "@/components/inline-divider";
import { MessageBox } from "@/components/message-box";
import { fetchGatewayCredits } from "@/lib/import/gatewayCredits";
import { isAllowedReceiptHost } from "@/lib/import/links";
import { createClient } from "@/lib/supabase/server";

import { updateFeedbackStatusAction } from "./actions";

// サイト管理者専用の管理ページ。ビューは2つ:
//  - 明細リンクの候補ホスト昇格: receipt_link_candidates を出現回数順に眺め、本物の
//    レシート基盤を RECEIPT_LINK_HOSTS（コード定数）に PR で昇格させる判断材料にする。
//    昇格の操作自体はこの画面には無い（コード変更＝PR レビューがゲート）。
//  - ユーザーフィードバック: 不具合報告・要望の一覧と対応状態の管理。
// 残高がこれを下回ったら警告を出す。目安は「上限まで使うユーザー1人の1か月分」
// （月100通 × 実測 $0.021 ≒ $2）。1人ぶんを切ったら手当てが要る、という線。
const CREDITS_LOW_USD = 2;

// AI Gateway のクレジット購入（top-up モーダル）。**チーム slug を埋め込まない**
// — `/d?to=` は Vercel 側でログイン中のチームに解決してくれるリダイレクタなので、
// この1本でよい（slug を焼き込むと、チームを変えた時に黙って迷子になる）。
const TOP_UP_URL =
  "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dtop-up";

// クレジットは USD 建て。小数が意味を持つ額なので3桁まで見せる。
function formatUsd(v: number): string {
  return `$${v.toFixed(3)}`;
}

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
    .select(
      "id, kind, body, path, status, created_at, platform, viewport, timezone, theme, app_version, user_agent, users(display_name)",
    )
    .order("created_at", { ascending: false });

  // AI Gateway の残高（診断）。尽きると取り込みが止まり、入金するまで復旧しない
  // ＝運用者が気づける場所が要る。1通あたりの単価は固定値を持たず実績から出す
  // （定数だと実態からずれていく）。
  //
  // **分母は ai_usage_baseline の累計通数を使う。** 以前は inbound_emails の
  // 行数を数えていたが、分子（AI Gateway の使用額）が累計なのに分母だけ
  // 「今残っている行」で、対応していなかった。受信箱を空にすると分母が
  // リセットされて単価が跳ね上がる（実測: 23通しか残っていない時に
  // $14.721 ÷ 23 = $0.64。実際は1通1〜2セント）。90日の自動削除でも同じ形で
  // 徐々に膨らむ。
  //
  // 残高だけでは足りない。**無料枠のレート制限は残高があっても掛かる**ので、
  // 「残高は十分なのに取り込みが進まない」が残高の表示からは読み取れない
  // （実際、残高 $1.5 のまま 80 通が数時間止まった）。詰まっている件数も並べる。
  const [credits, { data: baseline }, { count: rateLimitedCount }] =
    await Promise.all([
      fetchGatewayCredits(),
      supabase
        .from("ai_usage_baseline")
        .select("total_used_at_start, extracted_since")
        .maybeSingle(),
      supabase
        .from("inbound_emails")
        .select("id", { count: "exact", head: true })
        .eq("status", "error")
        .eq("extract_error_kind", "rate_limit"),
    ]);
  const since = baseline?.extracted_since ?? 0;
  const perEmail =
    credits && since > 0
      ? (credits.totalUsed - Number(baseline?.total_used_at_start ?? 0)) / since
      : null;
  const remainingEmails =
    credits && perEmail && perEmail > 0
      ? Math.floor(credits.balance / perEmail)
      : null;

  const [t, tFeedback, locale] = await Promise.all([
    getTranslations("admin"),
    getTranslations("feedback"),
    getLocale(),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{t("heading")}</h1>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("creditsHeading")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("creditsDescription")}
        </p>
        {credits ? (
          <>
            <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-xs text-muted-foreground">
                {t("creditsBalance")}
              </span>
              <span className="text-lg font-semibold tabular-nums">
                {formatUsd(credits.balance)}
              </span>
              <InlineDivider />
              <span className="text-xs text-muted-foreground">
                {t("creditsTotalUsed")}
              </span>
              <span className="text-sm tabular-nums">
                {formatUsd(credits.totalUsed)}
              </span>
            </div>
            {perEmail !== null && remainingEmails !== null && (
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {t("creditsPerEmail", { amount: formatUsd(perEmail) })}
                {" / "}
                {t("creditsRemainingEmails", { count: remainingEmails })}
              </p>
            )}
            {credits.balance < CREDITS_LOW_USD && (
              <MessageBox kind="warning" className="mt-3">
                {t("creditsLow")}
              </MessageBox>
            )}
          </>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            {t("creditsUnavailable")}
          </p>
        )}
        {rateLimitedCount ? (
          <MessageBox kind="warning" className="mt-3">
            {t("creditsRateLimited", { count: rateLimitedCount })}
          </MessageBox>
        ) : null}
        <p className="mt-3 text-sm">
          <a
            href={TOP_UP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            {t("creditsTopUp")}
          </a>
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("candidatesHeading")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("candidatesDescription")}
        </p>

        {(candidates ?? []).length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">
            {t("emptyState")}
          </p>
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
                  {/* バグ再現用の診断情報（ユーザーには見せていない）。 */}
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-subtle-foreground">
                    <span className="shrink-0">{f.platform}</span>
                    {f.viewport && (
                      <>
                        <InlineDivider />
                        <span className="shrink-0">{f.viewport}</span>
                      </>
                    )}
                    {f.timezone && (
                      <>
                        <InlineDivider />
                        <span className="shrink-0">{f.timezone}</span>
                      </>
                    )}
                    {f.theme && (
                      <>
                        <InlineDivider />
                        <span className="shrink-0">{f.theme}</span>
                      </>
                    )}
                    {f.app_version && (
                      <>
                        <InlineDivider />
                        <span className="shrink-0">{f.app_version}</span>
                      </>
                    )}
                    {f.user_agent && (
                      <>
                        <InlineDivider />
                        <span className="min-w-0 truncate">{f.user_agent}</span>
                      </>
                    )}
                  </div>
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
