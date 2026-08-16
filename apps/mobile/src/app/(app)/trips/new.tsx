import { ScrollView } from "react-native";

import { NewTripSheet } from "@/components/new-trip-sheet";
import { FormDraftProvider } from "@/lib/form-draft";

// 旅行作成（native formSheet ルート）。presentation 等の静的オプションは
// 親 Stack（(app)/_layout.tsx）で宣言する規約。
export default function NewTripRoute() {
  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <FormDraftProvider draftKey="trip:new">
        <NewTripSheet />
      </FormDraftProvider>
    </ScrollView>
  );
}
