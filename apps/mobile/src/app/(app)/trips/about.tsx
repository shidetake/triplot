import { router } from "expo-router";

import { AboutSheet } from "@/components/about-sheet";
import { SheetScroll } from "@/components/sheet-scroll";

// このアプリについて（native formSheet ルート）。設定からのドリルイン
// （router.push）。ライセンス一覧はさらに1段ドリルインする。
export default function AboutRoute() {
  return (
    <SheetScroll>
      <AboutSheet
        onOpenLicenses={() => router.push("/trips/licenses")}
        onOpenGoogleNotice={() => router.push("/trips/google-notice")}
      />
    </SheetScroll>
  );
}
