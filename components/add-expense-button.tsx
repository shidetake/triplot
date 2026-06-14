"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

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
      <Button
        type="button"
        size="icon"
        onClick={(e) => setAnchor({ x: e.clientX, y: e.clientY })}
        aria-label="費用を追加"
        title="費用を追加"
      >
        <PlusIcon size={18} />
      </Button>

      {anchor && (
        <FormPopover anchor={anchor} onClose={() => setAnchor(null)} label="費用を追加">
          <ExpenseForm {...props} onDone={() => setAnchor(null)} />
        </FormPopover>
      )}
    </div>
  );
}
