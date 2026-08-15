import { ScrollView, View } from "react-native";

import { EditTripSheet } from "@/components/edit-trip-sheet";
import { Toaster, useToastBottomClearance } from "@/components/toast";
import { useTripId } from "@/lib/useTripId";

// 旅行編集（native formSheet ルート）。カテゴリ管理・エクスポートへは
// EditTripSheet 内から router.push で兄弟ルートへドリルイン。
//
// <Toaster /> をこの画面専用にも持つ理由は trips/inbox.tsx のコメント参照
// （ルートの Toaster は native-stack の formSheet 画面には実機で届かない）。
export default function EditTripRoute() {
  const tripId = useTripId();
  const toastClearance = useToastBottomClearance();
  return (
    <View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: toastClearance }}
        keyboardShouldPersistTaps="handled"
      >
        <EditTripSheet tripId={tripId} />
      </ScrollView>
      <Toaster />
    </View>
  );
}
