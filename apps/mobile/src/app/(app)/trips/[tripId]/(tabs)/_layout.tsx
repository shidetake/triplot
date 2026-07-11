import { Tabs } from "expo-router";
import { useTranslations } from "use-intl";

import {
  CalendarDaysIcon,
  ListTodoIcon,
  MapIcon,
  WalletIcon,
} from "@/components/icons";

// 旅行詳細 = 予定/場所/費用/TODO の4タブ（画面サイズによらず常時タブ固定。
// web のモバイル幅タブと同じ並び・同じ Lucide アイコン）。
// ヘッダーは親 Stack（trips/[tripId]/_layout.tsx）の1本だけ（旅行名+戻る+編集）。
// Tabs 側のヘッダーは出さない（二重ヘッダー防止）。
export default function TripTabsLayout() {
  const t = useTranslations("tripTabs");

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#09090b",
          // web の text-muted-foreground（oklch(0.510)＝白地60%黒相当）と同値の
          // 不透明グレー。半透明(rgba)だと Lucide の複数パスが重なる箇所だけ
          // 透明度が二重にかかって黒ずむため、web と同じく濃度を焼き込んだ
          // 不透明値で塗る。
          tabBarInactiveTintColor: "#666666",
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
