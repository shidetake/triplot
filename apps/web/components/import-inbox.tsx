"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { SaveIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DismissEmailButton } from "@/components/dismiss-email-button";
import { ImportAddress } from "@/components/import-address";
import { InlineDivider } from "@/components/inline-divider";
import { MessageBox } from "@/components/message-box";
import { RefreshOnFocus } from "@/components/refresh-on-focus";
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
  assignTripAction,
  dismissEmailAction,
  unmergeAction,
} from "@/app/import/actions";

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
    next_retry_at: string | null;
  }[];
  usedThisMonth: number;
  overQuota: number;
}

// 取り込み受信箱の中身。ページ（/import）とヘッダーから開くシートの
// 両方が同じものを描く。見出し（h1 / シートのタイトル）は器側が出す。
export function ImportInbox({ data }: { data: ImportInboxData }) {
  const t = useTranslations("import");
  const tCommon = useTranslations("common");
  const locale = useLocale();
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
      {/* 転送したメールの抽出はサーバー側の非同期処理なので、戻ってきた
          タイミングで取り直す（旅行詳細は Realtime も併用）。 */}
      <RefreshOnFocus />

      <p className="mt-3 text-sm text-muted-foreground">
        {t("description")}
      </p>

      {importAddress && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs text-muted-foreground">{t("forwardLabel")}</span>
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
              className="flex items-start justify-between gap-3 rounded-lg border border-red-600/20 bg-red-50/50 p-3 dark:border-red-400/20 dark:bg-red-400/10"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">
                  {e.subject || e.sender || t("unknownMerchant")}
                </div>
                <div className="mt-0.5 text-xs text-red-700 dark:text-red-300">
                  {e.extract_error === EXTRACT_ERROR_NO_CONTENT
                    ? t("errorNoContent")
                    : e.next_retry_at
                      ? t("errorWillRetry")
                      : t("errorNoRetry")}
                </div>
              </div>
              <DismissEmailButton
                id={e.id}
                action={dismissEmailAction}
                className="h-7 w-7"
              />
            </li>
          ))}
        </ul>
      )}

      {rows.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">
          {t("emptyState")}
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-foreground/10 p-4">
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
                      action={assignTripAction}
                      className="flex items-center gap-2"
                    >
                      <input type="hidden" name="id" value={row.id} />
                      <select
                        name="trip_id"
                        defaultValue={row.defaultTripId}
                        className="rounded-md border border-foreground/20 bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
                      >
                        <option value="">{t("selectTrip")}</option>
                        {trips.map((trip) => (
                          <option key={trip.id} value={trip.id}>
                            {tripTitle.get(trip.id) ?? trip.title}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="submit"
                        size="iconSm"
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
                          title: tripTitle.get(row.assignedTripId) ?? t("tripFallback"),
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
                          const s = extractionSummary(row.own, t("unknownMerchant"));
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
                                {row.own?.receipt?.isUpdate ? t("adjustment") : ""}
                              </span>
                            </div>
                          );
                        })()}
                        {/* 合体された子メール（分けられる） */}
                        {row.children.map((ch) => {
                          const s = extractionSummary(ch.own, t("unknownMerchant"));
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
                                  {ch.own?.receipt?.isUpdate ? t("adjustment") : ""}
                                </span>
                              </span>
                              <form action={unmergeAction}>
                                <input type="hidden" name="id" value={ch.id} />
                                <button
                                  type="submit"
                                  className="shrink-0 rounded border border-foreground/20 px-2 py-0.5 text-xs text-muted-foreground transition hover:bg-foreground/10"
                                >
                                  {t("split")}
                                </button>
                              </form>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}
                </div>

                <DismissEmailButton
                  id={row.id}
                  action={dismissEmailAction}
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
