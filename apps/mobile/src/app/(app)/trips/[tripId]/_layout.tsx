import { Link, Stack } from "expo-router";
import { Pressable } from "react-native";

import { SettingsIcon } from "@/components/icons";
import { useTripDetail } from "@/lib/useTripDetail";
import { useTripId } from "@/lib/useTripId";

// 旅行詳細のルート: Stack（ヘッダー1本 = 旅行名 + 戻る + 編集ボタン）。
// 4タブは配下の (tabs) グループ、旅行編集はこの Stack の modal。
export default function TripLayout() {
  const tripId = useTripId();
  const { data } = useTripDetail(tripId);
  const tripTitle = data?.trip?.title ?? "";

  return (
    <Stack>
      <Stack.Screen
        name="(tabs)"
        options={{
          title: tripTitle,
          headerBackButtonDisplayMode: "minimal",
          headerRight: () => (
            <Link href={`/trips/${tripId}/edit`} asChild>
              <Pressable hitSlop={8} accessibilityLabel="旅行を編集">
                <SettingsIcon size={20} color="rgba(0,0,0,0.6)" />
              </Pressable>
            </Link>
          ),
        }}
      />
      <Stack.Screen name="edit" options={{ presentation: "modal" }} />
    </Stack>
  );
}
