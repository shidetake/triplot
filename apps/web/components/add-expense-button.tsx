"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { AddFab } from "./add-fab";
import { ExpenseForm } from "./expense-form";
import { type Anchor, FormPopover } from "./form-popover";
import { PlusIcon } from "./icons";
import { MOBILE_TAB_BOTTOM_OFFSET } from "@/lib/mobileTabChrome";

// 予定追加と同じ「ボタン → クリック位置にポップオーバー」スタイルで
// 費用追加フォームを出す。props は ExpenseForm にそのまま渡す。
type Props = Omit<React.ComponentProps<typeof ExpenseForm>, "onDone">;

export function AddExpenseButton(props: Props) {
  const t = useTranslations("expense");
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  return (
    <div>
      {/* 広い画面は見出し行の + 。狭い画面は見出し行を詰めて右下の FAB に
          逃がす（予定タブ・iOS と同形）。 */}
      <Button
        type="button"
        size="icon"
        onClick={(e) => setAnchor({ x: e.clientX, y: e.clientY })}
        aria-label={t("addAria")}
        title={t("addAria")}
        className="hidden md:inline-flex"
      >
        <PlusIcon size={18} />
      </Button>
      <AddFab
        onClick={(e) => setAnchor({ x: e.clientX, y: e.clientY })}
        label={t("addAria")}
        bottom={`calc(${MOBILE_TAB_BOTTOM_OFFSET} + 16px)`}
      />

      {anchor && (
        <FormPopover
          anchor={anchor}
          onClose={() => setAnchor(null)}
          label={t("addAria")}
          fullScreenOnNarrow
          draftKey={`expense:new:${props.tripId}`}
        >
          <ExpenseForm {...props} onDone={() => setAnchor(null)} />
        </FormPopover>
      )}
    </div>
  );
}
