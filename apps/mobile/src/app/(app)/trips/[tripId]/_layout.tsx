import { Link, Stack } from "expo-router";

import { HeaderIconButton } from "@/components/header-icon-button";
import { SettingsIcon } from "@/components/icons";
import { useTripDetail } from "@/lib/useTripDetail";
import { useTripId } from "@/lib/useTripId";

// 旅行詳細のルート。ヘッダーは親 Stack の1本だけ（戻る + 旅行名 + 編集）。
// 最初の <Stack.Screen> は自分を内包する親 Stack（(app)/_layout.tsx）の
// この route のオプションを注入する（旅行名が動的なので layout 側に書けない）。
// ネストした Stack 自身はヘッダーを出さない（二重ヘッダー防止）。
export default function TripLayout() {
  const tripId = useTripId();
  const { data } = useTripDetail(tripId);
  const tripTitle = data?.trip?.title ?? "";

  return (
    <>
      <Stack.Screen
        options={{
          title: tripTitle,
          headerBackButtonDisplayMode: "minimal",
          headerRight: () => (
            <Link href={`/trips/${tripId}/edit`} asChild>
              <HeaderIconButton accessibilityLabel="旅行を編集">
                <SettingsIcon size={20} color="#666666" />
              </HeaderIconButton>
            </Link>
          ),
        }}
      />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="edit" options={{ presentation: "modal" }} />
      </Stack>
    </>
  );
}
