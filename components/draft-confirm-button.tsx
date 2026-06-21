"use client";

import { Fragment, useState } from "react";

import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

import { ExpenseForm } from "./expense-form";
import { type Anchor, FormPopover } from "./form-popover";
import { InlineDivider } from "./inline-divider";

// 取り込み下書きの「確定」。クリックで事前入力済みの費用フォームを開き、
// 追加成功時に下書きを confirmed にして一覧から消す（router.refresh）。
// props は ExpenseForm にそのまま渡す（旅行画面が文脈を全部持っている）。
type Props = Omit<
  React.ComponentProps<typeof ExpenseForm>,
  "onDone" | "onSuccess"
> & {
  draftId: string;
  // ボタンに出す見出しの各部品（店名・金額・日付など）。間は InlineDivider（縦棒）で区切る。
  labelParts: string[];
};

export function DraftConfirmButton({
  draftId,
  labelParts,
  ...formProps
}: Props) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const router = useRouter();

  const onSuccess = async () => {
    const supabase = createClient();
    await supabase.rpc("resolve_inbound_email", {
      p_id: draftId,
      p_status: "confirmed",
    });
    router.refresh();
  };

  return (
    <div>
      <button
        type="button"
        onClick={(e) => setAnchor({ x: e.clientX, y: e.clientY })}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-foreground/10 px-3 py-2 text-left text-sm transition hover:border-foreground/40 hover:bg-foreground/10"
      >
        {/* 区切りは縦棒（InlineDivider）。先頭（店名）は長いと truncate、金額・日付は残す。 */}
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
          確定
        </span>
      </button>

      {anchor && (
        <FormPopover
          anchor={anchor}
          onClose={() => setAnchor(null)}
          label="取り込みを確定"
          fullScreenOnNarrow
          draftKey={`expense:import:${draftId}`}
        >
          <ExpenseForm
            {...formProps}
            onSuccess={onSuccess}
            onDone={() => setAnchor(null)}
          />
        </FormPopover>
      )}
    </div>
  );
}
