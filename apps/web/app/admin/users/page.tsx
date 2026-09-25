import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { MONTHLY_EMAIL_CAP } from "@triplot/shared/import/config";
import { effectiveEmailCap } from "@triplot/shared/import/emailCap";

import { ChevronIcon } from "@/components/icons";

import { requireAdmin } from "../require-admin";

// 管理ページの「ユーザー一覧」（使われ方の分析）。登録ユーザー1人を1行にした表。
//
// 人数が増えると長くなるので管理ページ本体からは分けてある（本体には入口だけ
// 置く）。誰かを見分けるための表示名・メールアドレス・ログイン方法と、件数と
// 日付だけを出す。旅行やメールの中身は出さない。
// 数えるのは管理者用の RPC（admin_user_usage）で、中身の表は管理者にも
// 読ませない（docs/database.md「データを誰に読ませるか」）。
export default async function AdminUsersPage() {
  const supabase = await requireAdmin();

  const [{ data: userUsage }, t] = await Promise.all([
    supabase.rpc("admin_user_usage"),
    getTranslations("admin"),
  ]);

  // 選ぶ一覧なので新しい順（最後に使った日が新しい人が先頭。一度も使って
  // いない人は末尾）。
  const rows = [...(userUsage ?? [])].sort((a, b) =>
    (b.last_active_at ?? "").localeCompare(a.last_active_at ?? ""),
  );
  // ログイン方法の表示名（ブランド名なので訳さない）。未知の値はそのまま出す。
  const providerLabel = (p: string | null) =>
    p === "google" ? "Google" : p === "apple" ? "Apple" : (p ?? "—");
  // 日付は YYYY-MM-DD（管理ページの LLM 使用量と揃える。UTC の日付）。
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

  const th = "px-2 py-2 text-right font-normal whitespace-nowrap";
  // 数字はすべて同じ濃さ。例外は「/ 上限」（件数の分母なので薄く）と、
  // 取り込み失敗が1件以上の時（状態を知らせる注意の色）だけ。
  const td = "px-2 py-2 text-right tabular-nums whitespace-nowrap";

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <Link
        href="/admin"
        className="-ml-1 inline-flex items-center gap-0.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ChevronIcon size={16} className="rotate-180" />
        {t("heading")}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        {t("usersListHeading")}
        {rows.length > 0 && (
          <span className="font-normal text-subtle-foreground">
            {" "}({rows.length})
          </span>
        )}
      </h1>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("usersListDescription")}
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {t("usersListEmpty")}
        </p>
      ) : (
        // 列が多いので、狭い画面では表だけを横にスクロールさせる
        // （ページ全体は横に動かさない）。
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/10 text-xs text-subtle-foreground">
                <th scope="col" className="py-2 pr-2 text-left font-normal">
                  {t("usersListColName")}
                </th>
                <th scope="col" className="px-2 py-2 text-left font-normal">
                  {t("usersListColEmail")}
                </th>
                <th scope="col" className="px-2 py-2 text-left font-normal whitespace-nowrap">
                  {t("usersListColProvider")}
                </th>
                <th scope="col" className={th}>
                  {t("usersListColLastActive")}
                </th>
                <th scope="col" className={th}>
                  {t("usersListColRegistered")}
                </th>
                <th scope="col" className={th}>
                  {t("usersListColTrips")}
                </th>
                <th scope="col" className={th}>
                  {t("usersListColImportsMonth")}
                </th>
                <th scope="col" className="py-2 pl-2 text-right font-normal whitespace-nowrap">
                  {t("usersListColFailed")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/10">
              {rows.map((u) => {
                const failed = Number(u.failed_count);
                return (
                  <tr key={u.user_id}>
                    <th
                      scope="row"
                      className="max-w-40 truncate py-2 pr-2 text-left font-medium"
                    >
                      {u.display_name || t("usersListNoName")}
                    </th>
                    <td className="max-w-56 truncate px-2 py-2 text-left">
                      {u.email || "—"}
                    </td>
                    <td className="px-2 py-2 text-left whitespace-nowrap">
                      {providerLabel(u.provider)}
                    </td>
                    <td className={td}>{day(u.last_active_at)}</td>
                    <td className={td}>{day(u.registered_at)}</td>
                    <td className={td}>{Number(u.trip_count)}</td>
                    <td className={td}>
                      {Number(u.imports_this_month)}
                      <span className="text-subtle-foreground">
                        {" / "}
                        {effectiveEmailCap(
                          MONTHLY_EMAIL_CAP,
                          u.cap_override as number | null,
                        )}
                      </span>
                    </td>
                    <td
                      className={`py-2 pl-2 text-right tabular-nums whitespace-nowrap ${
                        failed > 0 ? "text-amber-700 dark:text-amber-400" : ""
                      }`}
                    >
                      {failed}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
