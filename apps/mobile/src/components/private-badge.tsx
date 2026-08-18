import { View } from "react-native";
import { useTranslations } from "use-intl";

import { LockIcon } from "@/components/icons";
import { useTheme } from "@/lib/theme";

// private な場所/費用/予定/TODO の名前の隣に出す可視性インジケータ
// （web の components/private-badge.tsx と対）。「プライベート」の文言でなく
// 鍵アイコンにするのは、モバイルで面積を取らず世界的に通じるため
// （ui-guidelines「文言は極力アイコンに寄せる」）。意味は accessibilityLabel
// で担保する。size は 16 固定＝場所ごとに大きさが揺れないよう1ソース化する。
export function PrivateBadge() {
  const t = useTranslations("common");
  const theme = useTheme();
  return (
    <View accessibilityRole="image" accessibilityLabel={t("private")}>
      <LockIcon size={16} color={theme.mutedForeground} />
    </View>
  );
}
