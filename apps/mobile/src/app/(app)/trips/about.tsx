import { router } from "expo-router";
import { ScrollView } from "react-native";

import { AboutSheet } from "@/components/about-sheet";

// このアプリについて（native formSheet ルート）。設定からのドリルイン
// （router.push）。ライセンス一覧はさらに1段ドリルインする。
export default function AboutRoute() {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      <AboutSheet
        onOpenLicenses={() => router.push("/trips/licenses")}
        onOpenGoogleNotice={() => router.push("/trips/google-notice")}
      />
    </ScrollView>
  );
}
