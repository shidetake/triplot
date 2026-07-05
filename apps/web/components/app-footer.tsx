"use client";

import { usePathname } from "next/navigation";

import { useActiveTripTab } from "@/lib/activeTripTab";
import { MOBILE_TAB_BOTTOM_OFFSET } from "@/lib/mobileTabChrome";
import { useMediaQuery } from "./use-media-query";

// 旅行詳細ページの md ブレークポイントと同じ（trip-detail-tabs.tsx）。
const NARROW_SCREEN_QUERY = "(max-width: 767px)";
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
  const activeTab = useActiveTripTab();
  const onTripDetail = isNarrow && TRIP_DETAIL_PATH.test(pathname);

  // 予定/場所タブはカレンダー/地図を position:fixed で全画面ブリードしている。
  // fixed は通常の flow から外れ高さゼロになるため、このフッターは押し出され
  // ず固定コンテンツの下に隠れる。その2タブでは元々フッターを見る意味も
  // 無い（全画面表示の意図どおり）ので非表示にする。
  if (onTripDetail && (activeTab === "schedule" || activeTab === "places")) {
    return null;
  }

  return (
    <footer
      className="px-6 py-3 text-center text-xs text-subtle-foreground"
      // 費用/TODOタブは通常の縦積みで自然にスクロール末尾に来るが、狭い画面
      // では下に固定タブバーが常時被さっているため、その分の余白を足して
      // タブバーの下に隠れないようにする（隠れず自然なスクロール末尾で見える）。
      style={onTripDetail ? { paddingBottom: MOBILE_TAB_BOTTOM_OFFSET } : undefined}
    >
      {deployEnv} · {version}
    </footer>
  );
}
