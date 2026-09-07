import { useCallback, useMemo, useState } from "react";

import type { Undoable } from "@triplot/shared/undoable";

// 「元に戻す」付きで消す一覧のための、**画面から先に消す**仕組み。
//
// サーバの往復と再取得を待ってから消すと、その間ずっと空の行が残る（実機
// フィードバック: 取り込みの下書きで特に目立った。行が高いほど空白も大きい）。
// 結果は分かっているので、押した瞬間に見た目を合わせ、あとから実データで揃える。
//
// 使い方は2つだけ:
//
//   const hide = useOptimisticHide();
//   const rows = all.filter((r) => !hide.has(r.id));   // 一覧を絞る
//   runUndoable(hide.wrap(id, { apply, restore, done, failed }));
//
// **一覧の元のデータを絞ること**（絞った後の配列から件数・合計を出す）。
// 行だけ消して件数や合計を元の配列から出すと、「67 行なのに (68)」のような
// 食い違いが出る。
export function useOptimisticHide() {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());

  const set = useCallback((id: string, hidden: boolean) => {
    setIds((prev) => {
      if (prev.has(id) === hidden) return prev;
      const next = new Set(prev);
      if (hidden) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  return useMemo(
    () => ({
      has: (id: string) => ids.has(id),
      // Undoable に hide/show を足す。id は消す行のもの。
      wrap: <T,>(id: string, u: Undoable<T>): Undoable<T> => ({
        ...u,
        hide: () => set(id, true),
        show: () => set(id, false),
      }),
    }),
    [ids, set],
  );
}
