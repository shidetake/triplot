import { ExportSheet } from "@/components/export-sheet";
import { SheetScroll } from "@/components/sheet-scroll";
import { useTripIdParam } from "@/lib/useTripIdParam";

// エクスポート（ルート階層の native formSheet ルート）。旅行編集からのドリルイン。
// カレンダーエクスポートへは ExportSheet 内から router.push で兄弟ルートへ。
export default function ExportRoute() {
  const tripId = useTripIdParam();
  return (
    <SheetScroll>
      <ExportSheet tripId={tripId} />
    </SheetScroll>
  );
}
