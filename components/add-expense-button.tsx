"use client";

import { useState } from "react";

import { ExpenseForm } from "./expense-form";
import { type Anchor, FormPopover } from "./form-popover";

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
        className="h-9 rounded-md bg-black px-3 text-sm font-medium text-white transition hover:bg-zinc-800"
      >
        ＋ 費用を追加
      </button>

      {anchor && (
        <FormPopover anchor={anchor} onClose={() => setAnchor(null)}>
          <ExpenseForm {...props} onDone={() => setAnchor(null)} />
        </FormPopover>
      )}
    </div>
  );
}
