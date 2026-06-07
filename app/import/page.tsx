import Link from "next/link";
import { redirect } from "next/navigation";

import { CloseIcon } from "@/components/icons";
import { MONTHLY_EMAIL_CAP } from "@/lib/receipt/importConfig";
import { guessTripForReceipt, type TripRange } from "@/lib/receipt/tripMatch";
import type { Receipt } from "@/lib/receipt/schema";
import { createClient } from "@/lib/supabase/server";

import {
  assignTripAction,
  dismissDraftAction,
  unmergeAction,
} from "./actions";

export default async function ImportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // 自分が在籍中の旅行（割り当て先 ＋ 旅行推測）。
  const { data: memberships } = await supabase
    .from("trip_members")
    .select("trips(id, title, start_date, end_date)")
    .eq("user_id", user.id)
    .is("left_at", null);
  const trips = (memberships ?? [])
    .map((m) => m.trips)
    .filter((t): t is NonNullable<typeof t> => t !== null);
  const tripRanges: TripRange[] = trips.map((t) => ({
    id: t.id,
    startDate: t.start_date,
    endDate: t.end_date,
  }));
  const tripTitle = new Map(trips.map((t) => [t.id, t.title]));

  // 自分の抽出済み下書き（RLS で自分の行のみ）。割当済も未割当もここに出す。
  const { data: drafts } = await supabase
    .from("inbound_emails")
    .select("id, received_at, subject, extracted, trip_id")
    .eq("status", "extracted")
    .order("received_at", { ascending: false });

  // 当月の取り込み使用量と、上限超過で保留中の件数。
  const monthStart = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
  ).toISOString();
  const { count: usedThisMonth } = await supabase
    .from("inbound_emails")
    .select("id", { count: "exact", head: true })
    .gte("extracted_at", monthStart);
  const { count: overQuota } = await supabase
    .from("inbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("status", "over_quota");

  // 各下書きに合体された子メール（誤マージ確認・split 用）。
  const draftIds = (drafts ?? []).map((d) => d.id);
  const childrenByParent = new Map<
    string,
    { id: string; receipt: Receipt | null }[]
  >();
  if (draftIds.length > 0) {
    const { data: children } = await supabase
      .from("inbound_emails")
      .select("id, extracted, merged_into")
      .eq("status", "merged")
      .in("merged_into", draftIds);
    for (const c of children ?? []) {
      if (!c.merged_into) continue;
      const arr = childrenByParent.get(c.merged_into) ?? [];
      arr.push({ id: c.id, receipt: c.extracted as unknown as Receipt | null });
      childrenByParent.set(c.merged_into, arr);
    }
  }

  const rows = (drafts ?? []).map((d) => {
    const r = d.extracted as unknown as Receipt | null;
    const guess =
      r != null
        ? guessTripForReceipt({ date: r.date, serviceDate: r.serviceDate }, tripRanges)
        : null;
    const guessedTripId =
      guess && guess.tripIds.length === 1 ? guess.tripIds[0] : "";
    const ambiguous = !!guess && guess.tripIds.length > 1;
    return {
      id: d.id,
      receipt: r,
      assignedTripId: d.trip_id,
      // 割当済ならそれ、未割当は単一推測を初期選択。
      defaultTripId: d.trip_id ?? guessedTripId,
      guessedTripId,
      ambiguous,
      children: childrenByParent.get(d.id) ?? [],
    };
  });

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">取り込み</h1>
        <Link
          href="/"
          className="text-sm text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline"
        >
          ← ホーム
        </Link>
      </header>

      <p className="mt-3 text-sm text-zinc-600">
        転送したレシートの下書きです。まず<strong>どの旅行か</strong>を割り当てます。
        費用としての確定（支払者・割り勘・レート）は旅行の画面で行います。
      </p>

      <p className="mt-2 text-xs text-zinc-500">
        今月の取り込み: {usedThisMonth ?? 0} / {MONTHLY_EMAIL_CAP} 件
      </p>

      {(overQuota ?? 0) > 0 && (
        <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          ⚠ 今月の上限（{MONTHLY_EMAIL_CAP}件）に達したため、{overQuota}件が未処理の
          まま保留されています。翌月にリセットされます。
        </p>
      )}

      {rows.length === 0 ? (
        <p className="mt-10 text-sm text-zinc-500">
          まだ下書きはありません。
          <Link href="/settings" className="underline underline-offset-2">
            取り込み用アドレス
          </Link>
          にレシートを転送してみてください。
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-zinc-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {row.receipt?.merchant || "(店名不明)"}
                  </div>
                  <div className="mt-1 text-sm text-zinc-600">
                    {row.receipt
                      ? `${row.receipt.total} ${row.receipt.currency} ・ ${row.receipt.date} ・ ${row.receipt.category}`
                      : "(読み取り内容なし)"}
                    {row.receipt?.location ? ` ・ ${row.receipt.location}` : ""}
                  </div>

                  {/* 旅行の割り当て */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <form
                      action={assignTripAction}
                      className="flex items-center gap-2"
                    >
                      <input type="hidden" name="id" value={row.id} />
                      <select
                        name="trip_id"
                        defaultValue={row.defaultTripId}
                        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm focus:border-black focus:outline-none"
                      >
                        <option value="">（旅行を選択）</option>
                        {trips.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="h-8 rounded-md bg-black px-3 text-sm font-medium text-white transition hover:bg-zinc-800"
                      >
                        {row.assignedTripId ? "変更" : "割り当て"}
                      </button>
                    </form>

                    {row.assignedTripId ? (
                      <Link
                        href={`/trips/${row.assignedTripId}`}
                        className="text-sm font-medium text-zinc-900 underline underline-offset-2"
                      >
                        → {tripTitle.get(row.assignedTripId) ?? "旅行"}で確定
                      </Link>
                    ) : row.ambiguous ? (
                      <span className="text-xs text-amber-700">
                        候補が複数。旅行を選んでください
                      </span>
                    ) : row.guessedTripId ? (
                      <span className="text-xs text-zinc-500">
                        推測: {tripTitle.get(row.guessedTripId)}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-700">要割当</span>
                    )}
                  </div>

                  {row.children.length > 0 && (
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-zinc-500">
                        🔗 {row.children.length + 1}通を合体
                      </summary>
                      <div className="mt-2 space-y-1">
                        {row.children.map((ch) => (
                          <div
                            key={ch.id}
                            className="flex items-center justify-between gap-2 rounded bg-zinc-50 px-2 py-1"
                          >
                            <span className="min-w-0 truncate text-xs text-zinc-600">
                              {ch.receipt?.merchant || "(店名不明)"} ・{" "}
                              {ch.receipt?.total} {ch.receipt?.currency} ・{" "}
                              {ch.receipt?.date}
                              {ch.receipt?.isUpdate ? "（確定/更新）" : ""}
                            </span>
                            <form action={unmergeAction}>
                              <input type="hidden" name="id" value={ch.id} />
                              <button
                                type="submit"
                                className="shrink-0 rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 transition hover:bg-zinc-100"
                              >
                                分ける
                              </button>
                            </form>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>

                <form action={dismissDraftAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <button
                    type="submit"
                    aria-label="破棄"
                    title="破棄"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600"
                  >
                    <CloseIcon size={16} />
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
