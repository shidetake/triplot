import { router } from "expo-router";
import { ScrollView } from "react-native";

import { NewTripSheet } from "@/components/new-trip-sheet";

// 旅行作成（native formSheet ルート）。presentation 等の静的オプションは
// 親 Stack（(app)/_layout.tsx）で宣言する規約。
export default function NewTripRoute() {
  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <NewTripSheet onDone={() => router.back()} />
    </ScrollView>
  );
}
