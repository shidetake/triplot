import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useTranslations } from "use-intl";

import { useTheme } from "@/lib/theme";

// 旅行詳細 = 予定/場所/費用/TODO の4タブ（画面サイズによらず常時タブ固定。
// web のモバイル幅タブと同じ並び・同じ Lucide アイコン）。
// ヘッダーは親 Stack（trips/[tripId]/_layout.tsx）の1本だけ（旅行名+戻る+編集）。
//
// NativeTabs（expo-router/unstable-native-tabs）＝ react-native-screens が
// 同梱する本物のネイティブ Tabs ホスト（RNSTabsHostComponentView）を使う。
// 以前は @react-navigation/bottom-tabs（Pressable 等で描いた自作タブバー）
// だった。まだ unstable- 名前空間の実験的 API だが、OS 標準のタブバー部品
// そのものに乗る（iOS 26 の Liquid Glass タブバーにも自動追従する）。
//
// アイコン: <NativeTabs.Trigger.Icon src={<CalendarDaysIcon/>} /> のように
// React 要素をそのまま渡すのは動かない（実機ログ「Only VectorIcon is
// supported as a React element in Icon.src」）。ImageSourcePropType
// （静的画像）は渡せるので、components/icons.tsx の Lucide パスと同一の
// SVG を assets/tab-icons/ に事前ラスタライズして使う（web/iOS でパスを
// 揃える規約を維持するため、SF Symbols 等の別アイコンには差し替えない）。
// renderingMode 既定の "template" で iconColor によって選択/非選択の色が
// 自動的に塗られる（元画像は単色シルエットで OK）。
export default function TripTabsLayout() {
  const t = useTranslations("tripTabs");
  const theme = useTheme();

  return (
    <NativeTabs
      // 選択=foreground / 非選択=muted（web のタブと同じ意味構造）。
      iconColor={{
        default: theme.mutedForeground,
        selected: theme.foreground,
      }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t("schedule")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require("../../../../../../assets/tab-icons/calendar-days.png")}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="places">
        <NativeTabs.Trigger.Label>{t("places")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require("../../../../../../assets/tab-icons/map.png")}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="expenses">
        <NativeTabs.Trigger.Label>{t("expenses")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require("../../../../../../assets/tab-icons/wallet.png")}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="todos">
        <NativeTabs.Trigger.Label>{t("todos")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require("../../../../../../assets/tab-icons/list-todo.png")}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
