"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Fragment, useTransition } from "react";

import { ChevronIcon } from "@/components/icons";
import { inboxRowSummary } from "@triplot/shared/import/inboxRowSummary";
import { DismissEmailButton } from "@/components/dismiss-email-button";
import { ImportAddress } from "@/components/import-address";
import { InlineDivider } from "@/components/inline-divider";
import { MessageBox } from "@/components/message-box";
import {
  extractionSummary,
} from "@triplot/shared/import/draftLabel";
import type { InboxRow } from "@triplot/shared/import/inboxRows";
import {
  EXTRACT_ERROR_NO_CONTENT,
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
  // 上限は人によって違う（個別上書き）ので、サーバが計算した実効上限を受け取る。
  emailCap: number;
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
  // 「新規旅行」= どの旅行にも割り当てない状態。旅行一覧に候補（仮旅行）として
  // 出る。旅行が1つも無いと、この選択は「旅行を選択」だけの行き止まりになるので
  // その受け皿でもある。空の選択肢を選ぶと割り当てが外れる（＝候補に戻る）ので、
  // 既存の旅行を選んだ後でも元に戻せる。下書きが未確定のうちは戻せる必要がある
  // （確定すれば受信箱から消えるので、この選択自体が出なくなる）。
  //
  // 候補の計算は未割り当ての下書きだけを見るので、既に割り当て済みの行は
  // そのままでは候補に現れない。「割り当てを外したらどうなるか」を出したいので、
  // その行の下書きを足してから導出する。
  const draftsOf = (r: (typeof data.rows)[number]) => [
    ...(r.receipt
      ? [{ emailId: r.id, kind: "expense", payload: r.receipt }]
      : []),
    ...r.events.map((ev) => ({ emailId: r.id, kind: "event", payload: ev })),
  ];
  const unassignedDrafts = data.rows
    .filter((r) => !r.assignedTripId)
    .flatMap(draftsOf);
  const wouldBeNewTrip = (rowId: string) => {
    const row = data.rows.find((r) => r.id === rowId);
    if (!row) return false;
    return deriveTripProposals([
      ...unassignedDrafts.filter((d) => d.emailId !== rowId),
      ...draftsOf(row),
    ]).some((p) => p.emailIds.includes(rowId));
  };

  const {
    importAddress,
    trips,
    tripLabel: tripTitle,
    rows,
    errorRows,
    usedThisMonth,
    overQuota,
    emailCap,
  } = data;

  return (
    <>
      <p className="mt-3 text-sm text-muted-foreground">{t("description")}</p>

      {importAddress && (
        <div className="mt-4">
          <ImportAddress address={importAddress} />
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        {t("usageCount", { used: usedThisMonth, cap: emailCap })}
      </p>

      {/* 上限に達した時点で出す（保留が実際に発生する前でも）。保留が出る
          までは何も出ず、突然メールが取り込まれなくなる状態だった。 */}
      {(usedThisMonth >= emailCap || overQuota > 0) && (
        <MessageBox kind="warning" className="mt-3">
          {overQuota > 0
            ? t("quotaReachedHeld", { cap: emailCap, over: overQuota })
            : t("quotaReached", { cap: emailCap })}
        </MessageBox>
      )}

      {/* 取り込み待ち（順番待ち）と 取り込みに失敗 は別のまとまり。状態が違う
          ものを1つの枠に入れると、枠の意味（＝ここは1つのまとまり）と食い違う。 */}
      {(
        [
          ["waitingHeading", true],
          ["failedHeading", false],
        ] as const
      ).map(([headingKey, wantQueued]) => {
        const group = errorRows.filter(
          (e) => (e.extract_error_kind === "rate_limit") === wantQueued,
        );
        if (group.length === 0) return null;
        return (
        <div key={headingKey}>
          <h3 className="mt-6 text-xs text-muted-foreground">
            {t(headingKey, { count: group.length })}
          </h3>
          <ul className="mt-2 divide-y divide-foreground/10 overflow-hidden rounded-md border border-foreground/10">
          {group.map((e) => (
            <li
              key={e.id}
              // レート制限は「混んでいて順番待ち」であって失敗ではないので、
              // 赤い箱にしない（失敗したと誤解させない）。かといって通常の
              // カードと同じ見た目だと「済んだもの」に見えるので、薄いグレーの
              // 面で「まだ処理中」を示す。amber は使わない — ガイドラインで
              // amber は「要対応」の色で、これは放置すれば勝手に完了するため。
              // 破線も使わない — 「ここに追加できる」の意味で旅行の候補に
              // 使っており、同じ製品の中で記号が二重の意味を持つのを避ける。
              className={
                e.extract_error_kind === "rate_limit"
                  ? "flex items-start justify-between gap-3 bg-muted/60 p-3"
                  : "flex items-start justify-between gap-3 bg-red-50/50 p-3 dark:bg-red-400/10"
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
        </div>
        );
      })}

      {rows.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">{t("emptyState")}</p>
      ) : (
        <>
          <h3 className="mt-6 text-xs text-muted-foreground">
            {t("draftsHeading", { count: rows.length })}
          </h3>
          {/* 同種の項目が並ぶ一覧は1件ずつ枠と隙間を持たせず、一覧全体を1つの枠に
              して行を区切り線で分ける（ui-guidelines「カードや行を縦に並べる時の
              間隔」。費用一覧の ExpenseList と同じ形）。 */}
          <ul className="mt-2 divide-y divide-foreground/10 overflow-hidden rounded-md border border-foreground/10">
          {rows.map((row) => {
            // この画面の仕事は割り当てを決めることだけ（確定は各旅行の画面）。
            const summary = inboxRowSummary(row, {
              locale,
              subject: null,
              fallbackTitle: t("unknownMerchant"),
              formatAmount: (total, currency) => `${total} ${currency}`,
            });
            return (
            <li key={row.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{summary.title}</div>
                  {/* 載せるのは旅行の割り当てを決められる分だけ（金額・日時・
                      場所）。カテゴリと予定タイトルは判断に効かないので出さない。
                      組み立ては shared の inboxRowSummary（RN と同じ）。 */}
                  {summary.parts.length > 0 ? (
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                      {summary.parts.map((part, i) => (
                        <Fragment key={i}>
                          {i > 0 && <InlineDivider />}
                          <span>{part}</span>
                        </Fragment>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-1 text-sm text-muted-foreground">
                      {t("noContent")}
                    </div>
                  )}

                  {/* 旅行の割り当て */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {/* 1つ選ぶだけで完結する操作なので、選んだ時点で保存する
                        （保存ボタンを置かない → ui-guidelines「保存ボタンの
                        要否」）。結果は行の表示（→ ◯◯で確定 / 要割当）が
                        変わることで見える。 */}
                    <form className="flex items-center gap-2">
                      <select
                        name="trip_id"
                        defaultValue={row.defaultTripId}
                        disabled={isPending}
                        onChange={(e) => {
                          const tripId = e.currentTarget.value;
                          run(() =>
                            assignInboundEmailTrip(
                              createClient(),
                              row.id,
                              tripId || null,
                            ),
                          );
                        }}
                        className="rounded-md border border-foreground/20 bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
                      >
                        <option value="">
                          {wouldBeNewTrip(row.id)
                            ? t("newTrip")
                            : t("selectTrip")}
                        </option>
                        {trips.map((trip) => (
                          <option key={trip.id} value={trip.id}>
                            {tripTitle.get(trip.id) ?? trip.title}
                          </option>
                        ))}
                      </select>
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
                      <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-700 dark:bg-amber-400/20 dark:text-amber-300">
                        {t("needsAssignment")}
                      </span>
                    )}
                  </div>

                  {/* 開けることが分かる形にする＝文言だけだとタップできると
                      気付けない（実機フィードバック）。native の <details> の
                      既定マーカーは消し、開閉インジケータは ChevronIcon に
                      する（ui-guidelines「文字記号でなく ChevronIcon」）。 */}
                  {row.children.length > 0 && (
                    <details className="group mt-2 text-sm">
                      <summary className="flex cursor-pointer list-none items-center gap-1 py-1 text-xs text-muted-foreground [&::-webkit-details-marker]:hidden">
                        {t("mergedSummary", { count: row.children.length + 1 })}
                        <ChevronIcon
                          size={12}
                          className="transition group-open:rotate-90"
                        />
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
            );
          })}
        </ul>
        </>
      )}
    </>
  );
}
