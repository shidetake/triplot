import { useEffect, useRef, useState } from "react";

import {
  BUSY_INDICATOR_DELAY_MS,
  BUSY_INDICATOR_MIN_VISIBLE_MS,
} from "@triplot/shared/loading";

// 「処理中インジケータを今出すべきか」を返す。busy になってすぐには true に
// せず、閾値を超えて初めて true にする（速い処理では何も出さない）。一度出したら
// 最低表示時間だけは true を保つ（出た瞬間に消える点滅を防ぐ）。
//
// 規約は docs/ui-guidelines.md の「処理中（ローディング）」。閾値は web と
// 共有の定数（@triplot/shared/loading）。
export function useDelayedBusy(busy: boolean): boolean {
  const [visible, setVisible] = useState(false);
  // 出し始めた時刻。最低表示時間の計算に使う。
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    if (busy) {
      const timer = setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, BUSY_INDICATOR_DELAY_MS);
      return () => clearTimeout(timer);
    }

    // 閾値前に終わった＝一度も出していないので、そのまま何も出さない。
    if (shownAt.current == null) {
      setVisible(false);
      return;
    }
    const shownFor = Date.now() - shownAt.current;
    const rest = BUSY_INDICATOR_MIN_VISIBLE_MS - shownFor;
    if (rest <= 0) {
      shownAt.current = null;
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => {
      shownAt.current = null;
      setVisible(false);
    }, rest);
    return () => clearTimeout(timer);
  }, [busy]);

  return visible;
}
