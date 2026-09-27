"use client";

import { useEffect } from "react";

// 一度だけ知らせるための URL のパラメータ（?auth_error 等）を、表示した後に
// URL から消す。残っていると、再読み込みのたびに同じ知らせが出続ける。
//
// ルーターで遷移し直すとサーバー描画がやり直されて知らせも消えるので、
// ブラウザの履歴だけを書き換える（画面はそのまま）。
export function ClearQueryParam({ name }: { name: string }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(name)) return;
    url.searchParams.delete(name);
    window.history.replaceState(window.history.state, "", url.toString());
  }, [name]);
  return null;
}
