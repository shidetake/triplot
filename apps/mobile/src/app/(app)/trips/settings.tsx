import { router } from "expo-router";
import { ScrollView } from "react-native";

import { SettingsSheet } from "@/components/settings-sheet";

// 設定（native formSheet ルート）。フィードバックは兄弟ルートへの
// router.push（旧 stackBehavior="push" 相当のドリルイン）。
export default function SettingsRoute() {
  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <SettingsSheet
        onDone={() => router.back()}
        onOpenFeedback={() => router.push("/trips/feedback")}
      />
    </ScrollView>
  );
}
