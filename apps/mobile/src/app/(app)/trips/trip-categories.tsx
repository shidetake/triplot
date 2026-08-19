import { ScrollView } from "react-native";

import { CategoriesSheet } from "@/components/categories-sheet";
import { useTripIdParam } from "@/lib/useTripIdParam";

// カテゴリ管理（ルート階層の native formSheet ルート）。旅行編集からのドリルイン。
export default function CategoriesRoute() {
  const tripId = useTripIdParam();
  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <CategoriesSheet tripId={tripId} />
    </ScrollView>
  );
}
