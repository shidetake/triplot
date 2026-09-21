"use client";

import { useEffect } from "react";

// window.location.href によるクライアント側の直接遷移。next/navigation の
// redirect()（Server Action の 303 応答も、Server Component からの
// 307/ソフトナビも含む）は使わない: Safari の Smart App Banner は
// **リダイレクトを経由したページでは評価されない**ことを実機検証で確認済み
// （banner タグが正しく載っているページでも、307 経由だと出ない。同じ URL を
// ブラウザの更新ボタンで直接読み込むと出る）。リダイレクトを挟まないこの
// 直接遷移だけが Safari 上で banner を出せる（apps/web/app/layout.tsx 参照）。
// join 画面まわりの遷移（新規参加・既参加の両方）はここに集約する。
export function hardRedirect(to: string) {
  window.location.href = to;
}

// Server Component から使う版。マウント時に hardRedirect する。
export function HardRedirect({ to }: { to: string }) {
  useEffect(() => {
    hardRedirect(to);
  }, [to]);
  return null;
}
