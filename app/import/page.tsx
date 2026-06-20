import { redirect } from "next/navigation";
import Link from "next/link";

import { SaveIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { CloseButton } from "@/components/close-button";
import { ImportAddress } from "@/components/import-address";
import { InlineDivider } from "@/components/inline-divider";
import { MessageBox } from "@/components/message-box";
import { buildImportAddress } from "@/lib/receipt/inboundAddress";
import { MONTHLY_EMAIL_CAP } from "@/lib/receipt/importConfig";
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

  // 転送先アドレス（per-user・固定。無ければ発行）。受信箱ですぐ見えるように出す。
  const { data: importToken } = await supabase.rpc("ensure_import_token");
  const importAddress = importToken ? buildImportAddress(importToken) : null;

  // 自分が在籍中の旅行（割り当て先 ＋ 旅行推測）。
  const { data: memberships } = await supabase
    .from("trip_members")
    .select("trips(id, title, start_date, end_date)")
    .eq("user_id", user.id)
    .is("left_at", null);
  const trips = (memberships ?? [])
    .map((m) => m.trips)
    .filter((t): t is NonNullable<typeof t> => t !== null);
  const tripTitle = new Map(trips.map((t) => [t.id, t.title]));

  // 自分の抽出済み下書き（RLS で自分の行のみ）。割当済も未割当もここに出す。
  const { data: drafts } = await supabase
    .from("inbound_emails")
    .select("id, received_at, subject, extracted, merged_extracted, trip_id")
    .eq("status", "extracted")
    .order("received_at", { ascending: false });

  // 取り込みに失敗した行（RLS で自分の行のみ）。next_retry_at があれば自動リトライ待ち。
  const { data: errorRows } = await supabase
    .from("inbound_emails")
    .select("id, subject, sender, received_at, extract_error, next_retry_at")
    .eq("status", "error")
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
    // 実効値（合体済みなら合体後）を表示・推測に使う。own は各メール「自分の」値。
    // 単一推測は抽出時に自動割り当て済み。ここに残る未割当は人が選ぶだけ。
    const r = (d.merged_extracted ?? d.extracted) as unknown as Receipt | null;
    const own = d.extracted as unknown as Receipt | null;
    return {
      id: d.id,
      receipt: r,
      own,
      assignedTripId: d.trip_id,
      defaultTripId: d.trip_id ?? "",
      children: childrenByParent.get(d.id) ?? [],
    };
  });

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">取り込み</h1>

      <p className="mt-3 text-sm text-muted-foreground">
        転送したメールから抽出した費用の下書きです。この画面では旅行の割り当てを変更できます。確定は各旅行の画面で行ってください。
      </p>

      {importAddress && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs text-muted-foreground">メールの転送先</span>
          <ImportAddress address={importAddress} />
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        今月の取り込み: {usedThisMonth ?? 0} / {MONTHLY_EMAIL_CAP} 件
      </p>

      {(overQuota ?? 0) > 0 && (
        <MessageBox kind="warning" className="mt-3">
          ⚠ 今月の上限（{MONTHLY_EMAIL_CAP}件）に達したため、{overQuota}件が未処理の
          まま保留されています。翌月にリセットされます。
        </MessageBox>
      )}

      {(errorRows ?? []).length > 0 && (
        <ul className="mt-6 space-y-2">
          {(errorRows ?? []).map((e) => (
            <li
              key={e.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-red-600/20 bg-red-50/50 p-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">
                  {e.subject || e.sender || "(件名なし)"}
                </div>
                <div className="mt-0.5 text-xs text-red-700">
                  {e.next_retry_at
                    ? "取り込みに失敗しました。時間をおいて自動で再試行します。"
                    : "取り込みに失敗しました（再試行できませんでした）。"}
                </div>
              </div>
              <form action={dismissDraftAction}>
                <input type="hidden" name="id" value={e.id} />
                <CloseButton type="submit" label="破棄" className="h-7 w-7" />
              </form>
            </li>
          ))}
        </ul>
      )}

      {rows.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">
          まだ下書きはありません。上の転送先アドレスにレシートを転送してみてください。
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-foreground/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {row.receipt?.merchant || "(店名不明)"}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                    {row.receipt ? (
                      <>
                        <span>
                          {row.receipt.total} {row.receipt.currency}
                        </span>
                        <InlineDivider />
                        <span>{row.receipt.date}</span>
                        <InlineDivider />
                        <span>{row.receipt.category}</span>
                        {row.receipt.location ? (
                          <>
                            <InlineDivider />
                            <span>{row.receipt.location}</span>
                          </>
                        ) : null}
                      </>
                    ) : (
                      "(読み取り内容なし)"
                    )}
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
                        className="rounded-md border border-foreground/20 bg-white px-2 py-1 text-sm focus:border-primary focus:outline-none"
                      >
                        <option value="">（旅行を選択）</option>
                        {trips.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="submit"
                        size="iconSm"
                        aria-label="保存"
                        title="保存"
                        className="shrink-0"
                      >
                        <SaveIcon size={16} />
                      </Button>
                    </form>

                    {row.assignedTripId ? (
                      <Link
                        href={`/trips/${row.assignedTripId}`}
                        className="text-sm font-medium text-foreground underline underline-offset-2"
                      >
                        → {tripTitle.get(row.assignedTripId) ?? "旅行"}で確定
                      </Link>
                    ) : (
                      <span className="text-xs text-amber-700">
                        要割当
                      </span>
                    )}
                  </div>

                  {row.children.length > 0 && (
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-muted-foreground">
                        🔗 {row.children.length + 1}通を合体（明細）
                      </summary>
                      <div className="mt-2 space-y-1">
                        {/* この下書き自身の元メール（分けられない本体） */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded bg-zinc-50 px-2 py-1 text-xs text-muted-foreground">
                          <span>{row.own?.merchant || "(店名不明)"}</span>
                          <InlineDivider />
                          <span>
                            {row.own?.total} {row.own?.currency}
                          </span>
                          <InlineDivider />
                          <span>
                            {row.own?.date}
                            {row.own?.isUpdate ? "（調整）" : ""}
                          </span>
                        </div>
                        {/* 合体された子メール（分けられる） */}
                        {row.children.map((ch) => (
                          <div
                            key={ch.id}
                            className="flex items-center justify-between gap-2 rounded bg-zinc-50 px-2 py-1"
                          >
                            <span className="min-w-0 text-xs text-muted-foreground">
                              {ch.receipt?.merchant || "(店名不明)"} /{" "}
                              {ch.receipt?.total} {ch.receipt?.currency} /{" "}
                              {ch.receipt?.date}
                              {ch.receipt?.isUpdate ? "（調整）" : ""}
                            </span>
                            <form action={unmergeAction}>
                              <input type="hidden" name="id" value={ch.id} />
                              <button
                                type="submit"
                                className="shrink-0 rounded border border-foreground/20 px-2 py-0.5 text-xs text-muted-foreground transition hover:bg-foreground/10"
                              >
                                分割
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
                  <CloseButton type="submit" label="破棄" className="h-8 w-8" />
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
