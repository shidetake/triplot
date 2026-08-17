import * as Application from "expo-application";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";

import { ChevronIcon } from "@/components/icons";
import { SheetTitle } from "@/components/sheet-title";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";

// プライバシーポリシーは web 側の既存ページ（Google OAuth 審査のために
// 作った /privacy）をそのまま開く。アプリ内に複製しない（単一の真実）。
const PRIVACY_URL = "https://triplot.app/privacy";

// このアプリについて（設定からのドリルイン）。バージョン・プライバシー
// ポリシー・OSS ライセンス一覧への導線。web の同等ページは無い
// （モバイル固有の About 画面）。
export function AboutSheet({
  onOpenLicenses,
}: {
  onOpenLicenses: () => void;
}) {
  const t = useTranslations("about");
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  const version = Application.nativeApplicationVersion ?? "?";
  const build = Application.nativeBuildVersion ?? "?";

  return (
    <View style={styles.content}>
      <SheetTitle>{t("heading")}</SheetTitle>

      <View style={styles.navList}>
        <Pressable
          onPress={() => void Linking.openURL(PRIVACY_URL)}
          style={styles.navRow}
        >
          <Text style={styles.navRowLabel}>{t("privacyPolicy")}</Text>
          <ChevronIcon size={16} color={theme.subtleForeground} />
        </Pressable>

        <Pressable onPress={onOpenLicenses} style={styles.navRow}>
          <Text style={styles.navRowLabel}>{t("licenses")}</Text>
          <ChevronIcon size={16} color={theme.subtleForeground} />
        </Pressable>
      </View>

      <Text style={styles.version}>{t("version", { version, build })}</Text>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    content: { paddingHorizontal: 16, paddingBottom: 24 },
    // edit-trip-sheet.tsx の navList/navRow と同形（iOS 設定流のドリルイン行の
    // 並び。上端だけ navList が枠を持ち、行同士の区切りは各 navRow の下端）。
    navList: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.fgAlpha(0.08),
    },
    navRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.fgAlpha(0.08),
    },
    navRowLabel: { flex: 1, fontSize: 14, color: t.foreground },
    version: {
      fontSize: 12,
      color: t.subtleForeground,
      textAlign: "center",
      marginTop: 24,
    },
  });
