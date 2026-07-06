"use client";

import { useSyncExternalStore } from "react";

// メディアクエリの一致を購読する小フック。サーバー/初回クライアント描画は
// 常に false に揃え（getServerSnapshot）、hydration 後に実際の一致状態へ
// React 側で安全に切り替える（lib/activeTripTab.ts の useActiveTripTab と同じ
// useSyncExternalStore パターン）。旧実装（useState の初期化子で
// window.matchMedia を直接読む）は、サーバー(false)とクライアント初回描画
// (実際のmatches)が食い違うhydrationミスマッチの原因になり、この値で
// mount/unmountを切り替える箇所（例: app-footer.tsx）でDOM重複を起こした。
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (callback) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
