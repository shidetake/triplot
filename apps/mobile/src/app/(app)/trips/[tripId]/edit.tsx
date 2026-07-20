import { ScrollView } from "react-native";

import { EditTripSheet } from "@/components/edit-trip-sheet";
import { useTripId } from "@/lib/useTripId";

// 旅行編集（native formSheet ルート）。カテゴリ管理・エクスポートへは
// EditTripSheet 内から router.push で兄弟ルートへドリルイン。
export default function EditTripRoute() {
  const tripId = useTripId();
  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <EditTripSheet tripId={tripId} />
    </ScrollView>
  );
}
