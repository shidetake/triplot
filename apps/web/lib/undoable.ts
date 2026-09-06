"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import type { Undoable } from "@triplot/shared/undoable";

import { toast } from "@/components/toast";

// 「元に戻す」付きの操作を実行する（web）。RN 側（apps/mobile/src/lib/undoable.ts）
// と同じ形で、違うのはトーストの実装と再取得の仕方だけ。
//
// 手順はどの操作でも同じなので1箇所に置く: 実行 → 再取得 → 成功なら
// 「○○しました／元に戻す」のトースト → 押されたら復元して再取得。
// 復元した後にもう一度「元に戻す」は出さない（押すたびに行き来できると、
// どちらが元の状態なのか分からなくなる）。
//
// 規則と、そもそも「元に戻す」を付けてよいかの判断は
// @triplot/shared/undoable と docs/ui-guidelines.md を参照。
export function useUndoable(refresh: () => void) {
  const t = useTranslations();
  return useCallback(
    (u: Undoable) => {
      const run = async (
        step: Undoable["apply"],
        offerUndo: boolean,
      ): Promise<void> => {
        const r = await step();
        refresh();
        if (!r.ok) {
          toast(u.failed(r.error));
          return;
        }
        if (!offerUndo) return;
        toast(u.done, {
          label: t("common.undo"),
          onClick: () => void run(u.restore, false),
        });
      };
      void run(u.apply, true);
    },
    [refresh, t],
  );
}
