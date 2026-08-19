import { router, useLocalSearchParams } from "expo-router";
import { ScrollView } from "react-native";

import { SettingsSheet } from "@/components/settings-sheet";

// 設定（native formSheet ルート）。フィードバックは兄弟ルートへの
// router.push（旧 stackBehavior="push" 相当のドリルイン）。
//
// 旅行詳細のヘッダーから開いた時は tripId が付く。その時だけ「この旅行」の
// 行を出し、その旅行の設定シートへ潜る（旧・歯車アイコンの行き先）。
export default function SettingsRoute() {
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <SettingsSheet
        onDone={() => router.back()}
        onOpenFeedback={() => router.push("/trips/feedback")}
        onOpenAbout={() => router.push("/trips/about")}
        onOpenTrip={
          tripId ? () => router.push(`/trips/${tripId}/edit`) : undefined
        }
      />
    </ScrollView>
  );
}
