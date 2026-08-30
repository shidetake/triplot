import { CalendarExportSheet } from "@/components/calendar-export-sheet";
import { SheetScroll } from "@/components/sheet-scroll";
import { useTripIdParam } from "@/lib/useTripIdParam";

// Google カレンダーへエクスポート（ルート階層の native formSheet ルート）。
// エクスポート画面からのドリルイン。
export default function CalendarExportRoute() {
  const tripId = useTripIdParam();
  return (
    <SheetScroll>
      <CalendarExportSheet tripId={tripId} />
    </SheetScroll>
  );
}
