import { Stack, Tabs, useLocalSearchParams } from "expo-router";
import { useTranslations } from "use-intl";

import {
  CalendarDaysIcon,
  ListTodoIcon,
  MapIcon,
  WalletIcon,
} from "@/components/icons";
import { useTripDetail } from "@/lib/useTripDetail";

// 旅行詳細 = 予定/場所/費用/TODO の4タブ（画面サイズによらず常時タブ固定。
// web のモバイル幅タブと同じ並び・同じ Lucide アイコン）。
// ヘッダーは親 Stack の1本だけ（旅行名+戻る）。Tabs 側のヘッダーは出さない
// （二重ヘッダー防止）。
export default function TripTabsLayout() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const t = useTranslations("tripTabs");
  const { data } = useTripDetail(tripId);
  const tripTitle = data?.trip?.title ?? "";

  return (
    <>
      <Stack.Screen
        options={{
          title: tripTitle,
          headerBackButtonDisplayMode: "minimal",
        }}
      />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#09090b",
          tabBarInactiveTintColor: "rgba(0,0,0,0.45)",
        }}
      >
      <Tabs.Screen
        name="index"
        options={{
          title: t("schedule"),
          tabBarIcon: ({ color }) => (
            <CalendarDaysIcon size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="places"
        options={{
          title: t("places"),
          tabBarIcon: ({ color }) => <MapIcon size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: t("expenses"),
          tabBarIcon: ({ color }) => <WalletIcon size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="todos"
        options={{
          title: t("todos"),
          tabBarIcon: ({ color }) => <ListTodoIcon size={24} color={color} />,
        }}
      />
      </Tabs>
    </>
  );
}
