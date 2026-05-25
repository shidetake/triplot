"use client";

import { useState } from "react";

import { ExpenseForm } from "./expense-form";
import { type Anchor, FormPopover } from "./form-popover";
import { PlusIcon } from "./icons";

// 予定追加と同じ「ボタン → クリック位置にポップオーバー」スタイルで
// 費用追加フォームを出す。props は ExpenseForm にそのまま渡す。
type Props = Omit<React.ComponentProps<typeof ExpenseForm>, "onDone">;

export function AddExpenseButton(props: Props) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  return (
    <div>
      <button
        type="button"
        onClick={(e) => setAnchor({ x: e.clientX, y: e.clientY })}
        aria-label="費用を追加"
        className="flex h-9 w-9 items-center justify-center rounded-md bg-black text-white transition hover:bg-zinc-800"
      >
        <PlusIcon size={18} />
      </button>

      {anchor && (
        <FormPopover anchor={anchor} onClose={() => setAnchor(null)}>
          <ExpenseForm {...props} onDone={() => setAnchor(null)} />
        </FormPopover>
      )}
    </div>
  );
}
