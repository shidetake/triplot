"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { SaveIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DismissEmailButton } from "@/components/dismiss-email-button";
import { ImportAddress } from "@/components/import-address";
import { InlineDivider } from "@/components/inline-divider";
import { MessageBox } from "@/components/message-box";
import {
  eventDraftWhenLabel,
  extractionSummary,
} from "@triplot/shared/import/draftLabel";
import type { InboxRow } from "@triplot/shared/import/inboxRows";
import {
  EXTRACT_ERROR_NO_CONTENT,
  MONTHLY_EMAIL_CAP,
} from "@triplot/shared/import/config";

import {
  assignInboundEmailTrip,
  dismissInboundEmail,
  unmergeInboundEmail,
} from "@triplot/shared/data/inbox";
import { createClient } from "@/lib/supabase/client";
import { deriveTripProposals } from "@triplot/shared/import/tripProposal";

import { toast } from "@/components/toast";

export interface ImportInboxData {
  importAddress: string | null;
  // 旅行の選択肢（id → 表示ラベル。同名の旅行を見分けるため年・日数付き）。
  trips: { id: string; title: string }[];
  tripLabel: Map<string, string>;
  rows: InboxRow[];
  errorRows: {
    id: string;
    subject: string | null;
    sender: string | null;
    extract_error: string | null;
    extract_error_kind: string | null;
    next_retry_at: string | null;
  }[];
  usedThisMonth: number;
  overQuota: number;
}

// 取り込み受信箱の中身。ページ（/import）とヘッダーから開くシートの
// 両方が同じものを描く。見出し（h1 / シートのタイトル）は器側が出す。
export function ImportInbox({
  data,
  onChanged,
}: {
  data: ImportInboxData;
  // 書き込み後に呼ぶ。器（シート）が取り直す。
  onChanged: () => void;
}) {
  const t = useTranslations("import");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();

  // 書き込みは shared のデータ関数をブラウザの Supabase クライアントで直接
  // 呼ぶ（RN の受信箱と同じ形）。以前は server action ＋ revalidatePath だったが、
  // ページを廃してシートに一本化したので、再取得は器のコールバックで行う。
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        toast(t("dismissFailed", { error: r.error ?? "" }));
        return;
      }
      onChanged();
    });
  };
  // 旅行が1つも無いと、下の選択は「旅行を選択」だけの行き止まりになる。
  // そのメールが旅行の候補（仮旅行）に含まれているなら、新規旅行として
  // 扱われることをここでも示す。選べない選択肢にしてあるのは、作成は
  // 旅行一覧の候補カードで行うため（RN の import-pick-trip と同じ扱い）。
  const proposalEmailIds = new Set(
    deriveTripProposals(
      data.rows
        .filter((r) => !r.assignedTripId)
        .flatMap((r) => [
          ...(r.receipt
            ? [{ emailId: r.id, kind: "expense", payload: r.receipt }]
            : []),
          ...r.events.map((ev) => ({
            emailId: r.id,
            kind: "event",
            payload: ev,
          })),
        ]),
    ).flatMap((p) => p.emailIds),
  );

  const {
    importAddress,
    trips,
    tripLabel: tripTitle,
    rows,
    errorRows,
    usedThisMonth,
    overQuota,
  } = data;

  return (
    <>
      <p className="mt-3 text-sm text-muted-foreground">{t("description")}</p>

      {importAddress && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs text-muted-foreground">
            {t("forwardLabel")}
          </span>
          <ImportAddress address={importAddress} />
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        {t("usageCount", { used: usedThisMonth, cap: MONTHLY_EMAIL_CAP })}
      </p>

      {overQuota > 0 && (
        <MessageBox kind="warning" className="mt-3">
          {t("overQuotaWarning", { cap: MONTHLY_EMAIL_CAP, over: overQuota })}
        </MessageBox>
      )}

      {errorRows.length > 0 && (
        <ul className="mt-6 space-y-2">
          {errorRows.map((e) => (
            <li
              key={e.id}
              // レート制限は「混んでいて順番待ち」であって失敗ではないので、
              // 赤い箱にしない（失敗したと誤解させない）。
              className={
                e.extract_error_kind === "rate_limit"
                  ? "flex items-start justify-between gap-3 rounded-lg border border-foreground/10 p-3"
                  : "flex items-start justify-between gap-3 rounded-lg border border-red-600/20 bg-red-50/50 p-3 dark:border-red-400/20 dark:bg-red-400/10"
              }
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">
                  {e.subject || e.sender || t("unknownMerchant")}
                </div>
                <div
                  className={
                    e.extract_error_kind === "rate_limit"
                      ? "mt-0.5 text-xs text-muted-foreground"
                      : "mt-0.5 text-xs text-red-700 dark:text-red-300"
                  }
                >
                  {e.extract_error === EXTRACT_ERROR_NO_CONTENT
                    ? t("errorNoContent")
                    : e.extract_error_kind === "rate_limit"
                      ? t("errorRateLimited")
                      : e.next_retry_at
                        ? t("errorWillRetry")
                        : t("errorNoRetry")}
                </div>
              </div>
              <DismissEmailButton
                id={e.id}
                onDismiss={(id) =>
                  run(() => dismissInboundEmail(createClient(), id))
                }
                className="h-7 w-7"
              />
            </li>
          ))}
        </ul>
      )}

      {rows.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">{t("emptyState")}</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-lg border border-foreground/10 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {row.receipt?.merchant ||
                      row.events[0]?.title ||
                      t("unknownMerchant")}
                  </div>
                  {row.receipt && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
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
                    </div>
                  )}
                  {row.events.map((ev, i) => (
                    <div
                      key={i}
                      className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground"
                    >
                      <span>{ev.title || tCommon("untitledEvent")}</span>
                      <InlineDivider />
                      <span>{eventDraftWhenLabel(ev, locale)}</span>
                    </div>
                  ))}
                  {!row.receipt && row.events.length === 0 && (
                    <div className="mt-1 text-sm text-muted-foreground">
                      {t("noContent")}
                    </div>
                  )}

                  {/* 旅行の割り当て */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const tripId = new FormData(e.currentTarget).get(
                          "trip_id",
                        );
                        run(() =>
                          assignInboundEmailTrip(
                            createClient(),
                            row.id,
                            typeof tripId === "string" && tripId
                              ? tripId
                              : null,
                          ),
                        );
                      }}
                      className="flex items-center gap-2"
                    >
                      <select
                        name="trip_id"
                        defaultValue={row.defaultTripId}
                        className="rounded-md border border-foreground/20 bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
                      >
                        <option value="">{t("selectTrip")}</option>
                        {proposalEmailIds.has(row.id) && (
                          <option value="" disabled>
                            {t("newTrip")}
                          </option>
                        )}
                        {trips.map((trip) => (
                          <option key={trip.id} value={trip.id}>
                            {tripTitle.get(trip.id) ?? trip.title}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="submit"
                        size="iconSm"
                        disabled={isPending}
                        aria-label={tCommon("save")}
                        title={tCommon("save")}
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
                        {t("confirmAtTrip", {
                          title:
                            tripTitle.get(row.assignedTripId) ??
                            t("tripFallback"),
                        })}
                      </Link>
                    ) : (
                      <span className="text-xs text-amber-700 dark:text-amber-400">
                        {t("needsAssignment")}
                      </span>
                    )}
                  </div>

                  {row.children.length > 0 && (
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-muted-foreground">
                        {t("mergedSummary", { count: row.children.length + 1 })}
                      </summary>
                      <div className="mt-2 space-y-1">
                        {/* このメール自身の元の抽出値（分けられない本体） */}
                        {(() => {
                          const s = extractionSummary(
                            row.own,
                            t("unknownMerchant"),
                          );
                          return (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                              <span>{s.title}</span>
                              {s.amount && (
                                <>
                                  <InlineDivider />
                                  <span>{s.amount}</span>
                                </>
                              )}
                              <InlineDivider />
                              <span>
                                {s.date}
                                {row.own?.receipt?.isUpdate
                                  ? t("adjustment")
                                  : ""}
                              </span>
                            </div>
                          );
                        })()}
                        {/* 合体された子メール（分けられる） */}
                        {row.children.map((ch) => {
                          const s = extractionSummary(
                            ch.own,
                            t("unknownMerchant"),
                          );
                          return (
                            <div
                              key={ch.id}
                              className="flex items-center justify-between gap-2 rounded bg-muted px-2 py-1"
                            >
                              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                <span>{s.title}</span>
                                {s.amount && (
                                  <>
                                    <InlineDivider />
                                    <span>{s.amount}</span>
                                  </>
                                )}
                                <InlineDivider />
                                <span>
                                  {s.date}
                                  {ch.own?.receipt?.isUpdate
                                    ? t("adjustment")
                                    : ""}
                                </span>
                              </span>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() =>
                                  run(() =>
                                    unmergeInboundEmail(createClient(), ch.id),
                                  )
                                }
                                className="shrink-0 rounded border border-foreground/20 px-2 py-0.5 text-xs text-muted-foreground transition hover:bg-foreground/10 disabled:opacity-50"
                              >
                                {t("split")}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}
                </div>

                <DismissEmailButton
                  id={row.id}
                  onDismiss={(id) =>
                    run(() => dismissInboundEmail(createClient(), id))
                  }
                  className="h-8 w-8"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
