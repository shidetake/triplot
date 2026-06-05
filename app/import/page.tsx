import Link from "next/link";
import { redirect } from "next/navigation";

import { CloseIcon } from "@/components/icons";
import { guessTripForReceipt, type TripRange } from "@/lib/receipt/tripMatch";
import type { Receipt } from "@/lib/receipt/schema";
import { createClient } from "@/lib/supabase/server";

import { dismissDraftAction } from "./actions";

export default async function ImportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // 旅行推測に使う、自分が在籍中の旅行。
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

  // 自分の抽出済み下書き（RLS で自分の行のみ）。
  const { data: drafts } = await supabase
    .from("inbound_emails")
    .select("id, received_at, subject, extracted")
    .eq("status", "extracted")
    .order("received_at", { ascending: false });

  const rows = (drafts ?? []).map((d) => {
    const r = d.extracted as unknown as Receipt | null;
    const guess =
      r != null
        ? guessTripForReceipt({ date: r.date, serviceDate: r.serviceDate }, tripRanges)
        : null;
    let tripLabel: { text: string; kind: "ok" | "warn" } = {
      text: "要割当",
      kind: "warn",
    };
    if (guess && guess.tripIds.length === 1) {
      tripLabel = { text: tripTitle.get(guess.tripIds[0]) ?? "?", kind: "ok" };
    } else if (guess && guess.tripIds.length > 1) {
      tripLabel = { text: "要確認（複数候補）", kind: "warn" };
    }
    return { id: d.id, receipt: r, subject: d.subject, tripLabel };
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
        転送したレシートから自動で読み取った下書きです。
        <Link href="/settings" className="underline underline-offset-2">
          設定の取り込み用アドレス
        </Link>
        に転送すると、ここに溜まります。
      </p>

      {rows.length === 0 ? (
        <p className="mt-10 text-sm text-zinc-500">
          まだ下書きはありません。レシートを転送してみてください。
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-lg border border-zinc-200 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {row.receipt?.merchant || "(店名不明)"}
                  </div>
                  <div className="mt-1 text-sm text-zinc-600">
                    {row.receipt
                      ? `${row.receipt.total} ${row.receipt.currency} ・ ${row.receipt.date} ・ ${row.receipt.category}`
                      : "(読み取り内容なし)"}
                    {row.receipt?.location ? ` ・ ${row.receipt.location}` : ""}
                  </div>
                  <div className="mt-2">
                    <span
                      className={
                        "inline-block rounded-full px-2 py-0.5 text-xs " +
                        (row.tripLabel.kind === "ok"
                          ? "bg-zinc-100 text-zinc-700"
                          : "bg-amber-50 text-amber-800")
                      }
                    >
                      旅行: {row.tripLabel.text}
                    </span>
                  </div>
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

      <p className="mt-8 text-xs text-zinc-400">
        ※ 費用としての確定（旅行・支払者・割り勘の確認）は次の段階で対応します。
      </p>
    </main>
  );
}
