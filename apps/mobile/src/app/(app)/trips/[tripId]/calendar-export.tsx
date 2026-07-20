import { ScrollView } from "react-native";

import { CalendarExportSheet } from "@/components/calendar-export-sheet";
import { useTripId } from "@/lib/useTripId";

// Google カレンダーへエクスポート（native formSheet ルート）。
// エクスポート画面からのドリルイン。
export default function CalendarExportRoute() {
  const tripId = useTripId();
  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <CalendarExportSheet tripId={tripId} />
    </ScrollView>
  );
}
