import { useShareIntentContext } from "expo-share-intent";
import { useEffect, useRef } from "react";

import { pushOnce } from "@/lib/navigate";

// 共有の拡張機能（Google マップの「共有」→ triplot）から何か届いたら、旅行を
// 選ぶシート（trips/shared-place）を開く。描画は持たない。
//
// ログイン後の (app) の中に置く（未ログインで届いても、ログインした後に開く）。
// 同じ共有で二度開かないよう、開いた中身を覚えておく。中身はシートの側が
// 使い終わったら消す（resetShareIntent）。
export function SharedPlaceOpener() {
  const { hasShareIntent, shareIntent } = useShareIntentContext();
  const opened = useRef<string | null>(null);

  useEffect(() => {
    if (!hasShareIntent) {
      opened.current = null;
      return;
    }
    const key = shareIntent.webUrl ?? shareIntent.text ?? "";
    if (opened.current === key) return;
    opened.current = key;
    pushOnce("/trips/shared-place");
  }, [hasShareIntent, shareIntent]);

  return null;
}
