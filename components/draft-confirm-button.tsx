"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

import { ExpenseForm } from "./expense-form";
import { type Anchor, FormPopover } from "./form-popover";

// 取り込み下書きの「確定」。クリックで事前入力済みの費用フォームを開き、
// 追加成功時に下書きを confirmed にして一覧から消す（router.refresh）。
// props は ExpenseForm にそのまま渡す（旅行画面が文脈を全部持っている）。
type Props = Omit<
  React.ComponentProps<typeof ExpenseForm>,
  "onDone" | "onSuccess"
> & {
  draftId: string;
  label: string; // ボタンに出す見出し（店名＋金額など）
};

export function DraftConfirmButton({ draftId, label, ...formProps }: Props) {
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
        <span className="min-w-0 truncate">{label}</span>
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
