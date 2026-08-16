"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// タブに戻ってきたらサーバー描画を作り直す。
//
// 共同編集アプリなので、他のメンバーが足した予定・費用や、メール取り込みで
// 増えた下書きは自分の操作なしに増える。iOS は画面にフォーカスが戻るたび
// 再取得しているが、web は SSR の結果を握ったままで、手動リロードするまで
// 古い内容が残っていた。
//
// 画面を見続けている最中まで追う（ポーリング）ことはしない。web の再描画は
// ページ全体の再生成になるので、「離れて戻ってきた」タイミングだけに絞る。
// 旅行詳細だけは取り込み下書きの Realtime も併用する
// （components/trip-drafts-realtime.tsx）。
export function RefreshOnFocus() {
  const router = useRouter();

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  return null;
}
