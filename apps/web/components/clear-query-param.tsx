"use client";

import { useEffect } from "react";

// 一度だけ知らせるための URL のパラメータ（?auth_error 等）を、表示した後に
// URL から消す。残っていると、再読み込みのたびに同じ知らせが出続ける。
//
// ルーターで遷移し直すとサーバー描画がやり直されて知らせも消えるので、
// ブラウザの履歴だけを書き換える（画面はそのまま）。
export function ClearQueryParam({ names }: { names: string[] }) {
  const key = names.join(",");
  useEffect(() => {
    const url = new URL(window.location.href);
    const present = key.split(",").filter((n) => url.searchParams.has(n));
    if (present.length === 0) return;
    for (const n of present) url.searchParams.delete(n);
    window.history.replaceState(window.history.state, "", url.toString());
  }, [key]);
  return null;
}
