"use client";

import { Fragment, type ReactNode, useState } from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "next/navigation";

import { resolveInboundDraft } from "@triplot/shared/data/inbox";
import { confirmDialog } from "@/components/confirm-dialog";
import { createClient } from "@/lib/supabase/client";

import { CloseButton } from "./close-button";
import { type Anchor, FormPopover } from "./form-popover";
import { InlineDivider } from "./inline-divider";

// 取り込み下書き（費用/予定の1項目）の行。クリックで事前入力済みフォーム（children）を
// 開き、追加成功で下書きを confirmed に、× で dismissed にして一覧から消す
// （router.refresh）。費用は DraftConfirmButton、予定は EventDraftConfirmButton が
// この行にそれぞれのフォームを載せる。
export function ImportDraftRow({
  draftId,
  labelParts,
  formLabel,
  draftKey,
  children,
}: {
  draftId: string;
  // ボタンに出す見出しの各部品（店名・金額・日付など）。間は InlineDivider（縦棒）で区切る。
  labelParts: string[];
  formLabel: string;
  draftKey: string;
  // フォームのレンダラ。confirmDraft を onSuccess（作成 id 付き）に、close を onDone に繋ぐ。
  children: (args: {
    confirmDraft: (ids?: { expenseId?: string; eventId?: string }) => Promise<void>;
    close: () => void;
  }) => ReactNode;
}) {
  const t = useTranslations("import");
  const tCommon = useTranslations("common");
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const router = useRouter();

  const resolve = async (
    status: "confirmed" | "dismissed",
    ids?: { expenseId?: string; eventId?: string },
  ) => {
    const supabase = createClient();
    await resolveInboundDraft(supabase, draftId, status, ids);
    router.refresh();
  };

  const onDismiss = async () => {
    if (!(await confirmDialog({ title: t("dismissDraftTitle") }))) return;
    await resolve("dismissed");
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => setAnchor({ x: e.clientX, y: e.clientY })}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md border border-foreground/10 px-3 py-2 text-left text-sm transition hover:border-foreground/40 hover:bg-foreground/10"
        >
          {/* 区切りは縦棒（InlineDivider）。先頭（店名等）は長いと truncate、金額・日付は残す。 */}
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {labelParts.map((part, i) => (
              <Fragment key={i}>
                {i > 0 && <InlineDivider />}
                <span className={i === 0 ? "min-w-0 truncate" : "shrink-0"}>
                  {part}
                </span>
              </Fragment>
            ))}
          </span>
          <span className="shrink-0 rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
            {tCommon("confirm")}
          </span>
        </button>
        <CloseButton label={t("dismiss")} onClick={onDismiss} className="shrink-0" />
      </div>

      {anchor && (
        <FormPopover
          anchor={anchor}
          onClose={() => setAnchor(null)}
          label={formLabel}
          fullScreenOnNarrow
          draftKey={draftKey}
        >
          {children({
            confirmDraft: (ids) => resolve("confirmed", ids),
            close: () => setAnchor(null),
          })}
        </FormPopover>
      )}
    </div>
  );
}
