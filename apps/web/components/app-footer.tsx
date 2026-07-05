"use client";

import { usePathname } from "next/navigation";

import { useMediaQuery } from "./use-media-query";

// 旅行詳細ページの md ブレークポイントと同じ（trip-detail-tabs.tsx）。
const NARROW_SCREEN_QUERY = "(max-width: 767px)";
// 旅行詳細ページ（/trips/[tripId]）だけ、狭い画面でカレンダー/地図を
// position:fixed の全画面ブリードにしている。そのタブ領域は position:fixed
// で高さゼロのため、後続のこのフッターは通常の flow で押し出されず、
// フッターの位置に固定コンテンツが被って見えなくなる。旅行詳細×狭い画面だけ
// フッター自体を隠す（広い画面・他ページは元通り表示）。
const TRIP_DETAIL_PATH = /^\/trips\/[^/]+/;

export function AppFooter({
  deployEnv,
  version,
}: {
  deployEnv: string;
  version: string;
}) {
  const pathname = usePathname();
  const isNarrow = useMediaQuery(NARROW_SCREEN_QUERY);
  if (isNarrow && TRIP_DETAIL_PATH.test(pathname)) return null;

  return (
    <footer className="px-6 py-3 text-center text-xs text-subtle-foreground">
      {deployEnv} · {version}
    </footer>
  );
}
