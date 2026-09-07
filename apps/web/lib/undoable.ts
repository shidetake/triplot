"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import { TOAST_WITH_ACTION_MS } from "@triplot/shared/toastDuration";
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
// **hide/show が渡されたら、見た目を先に合わせる**（Undoable の hide 参照）。
// その時は成功しても**すぐには再取得しない** — 消した行が手元のデータに残って
// いれば、「元に戻す」を押した時も待たせずに戻せる。再取得は「元に戻す」を
// 押した時か、押されないままトーストが消えた時にやる。
//
// 規則と、そもそも「元に戻す」を付けてよいかの判断は
// @triplot/shared/undoable と docs/ui-guidelines.md を参照。
export function useUndoable(refresh: () => void) {
  const t = useTranslations();
  return useCallback(
    <T,>(u: Undoable<T>) => {
      const finish = (r: { ok: true } | { ok: false; error: string }) => {
        if (!r.ok) toast(u.failed(r.error));
        return r.ok;
      };
      const run = async (): Promise<void> => {
        u.hide?.();
        const r = await u.apply();
        if (!r.ok) {
          u.show?.();
          refresh();
          finish(r);
          return;
        }
        if (!u.hide) refresh();

        // 再取得は1回だけ（「元に戻す」を押した時か、押されずに終わった時）。
        let settled = false;
        const settle = () => {
          if (settled) return;
          settled = true;
          refresh();
          u.show?.();
        };
        const timer = u.hide
          ? setTimeout(settle, TOAST_WITH_ACTION_MS)
          : null;

        toast(u.done, {
          label: t("common.undo"),
          onClick: () =>
            void (async () => {
              if (timer) clearTimeout(timer);
              settled = true;
              const back = await u.restore(r.data);
              // 手元のデータに残しておいた行を、待たずに戻す。
              u.show?.();
              refresh();
              finish(back);
            })(),
        });
      };
      void run();
    },
    [refresh, t],
  );
}
