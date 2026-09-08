
import { AboutSheet } from "@/components/about-sheet";
import { SheetScroll } from "@/components/sheet-scroll";
import { pushOnce } from "@/lib/navigate";

// このアプリについて（native formSheet ルート）。設定からのドリルイン
// （router.push）。ライセンス一覧はさらに1段ドリルインする。
export default function AboutRoute() {
  return (
    <SheetScroll>
      <AboutSheet
        onOpenLicenses={() => pushOnce("/trips/licenses")}
        onOpenGoogleNotice={() => pushOnce("/trips/google-notice")}
      />
    </SheetScroll>
  );
}
