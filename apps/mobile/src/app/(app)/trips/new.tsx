import { ScrollView } from "react-native";

import { CreateTripSheet } from "@/components/create-trip-sheet";
import { FormHostProvider } from "@/components/form-host";

// 旅行作成（native formSheet ルート）。presentation 等の静的オプションは
// 親 Stack（(app)/_layout.tsx）で宣言する規約。
export default function NewTripRoute() {
  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <FormHostProvider draftKey="trip:new">
        <CreateTripSheet />
      </FormHostProvider>
    </ScrollView>
  );
}
