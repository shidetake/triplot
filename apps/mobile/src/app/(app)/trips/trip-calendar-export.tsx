import { ScrollView } from "react-native";

import { CalendarExportSheet } from "@/components/calendar-export-sheet";
import { useTripIdParam } from "@/lib/useTripIdParam";

// Google カレンダーへエクスポート（ルート階層の native formSheet ルート）。
// エクスポート画面からのドリルイン。
export default function CalendarExportRoute() {
  const tripId = useTripIdParam();
  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <CalendarExportSheet tripId={tripId} />
    </ScrollView>
  );
}
