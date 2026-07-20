import { ScrollView } from "react-native";

import { CategoriesSheet } from "@/components/categories-sheet";
import { useTripId } from "@/lib/useTripId";

// カテゴリ管理（native formSheet ルート）。旅行編集からのドリルイン。
export default function CategoriesRoute() {
  const tripId = useTripId();
  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <CategoriesSheet tripId={tripId} />
    </ScrollView>
  );
}
