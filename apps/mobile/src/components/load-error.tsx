import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";

import { type Theme, useThemedStyles } from "@/lib/theme";

// データ取得に失敗した時の最後の砦。trip 詳細の各タブは全て useTripDetail の
// loadError をここに渡すだけで良い（apps/mobile/src/lib/useTripDetail.ts
// 参照）。新しい画面を足す時もこの部品をコピーではなく再利用すること。
export function LoadError({
  error,
  onRetry,
  isRetrying,
}: {
  error: unknown;
  onRetry: () => void;
  isRetrying?: boolean;
}) {
  const t = useTranslations("common");
  const styles = useThemedStyles(makeStyles);
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);

  return (
    <View style={styles.container}>
      <Text style={styles.error}>{t("loadError", { message })}</Text>
      <Pressable
        onPress={onRetry}
        disabled={isRetrying}
        style={[styles.retryButton, isRetrying && styles.disabled]}
      >
        <Text style={styles.retryButtonText}>{t("retry")}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    container: { flex: 1, padding: 24, gap: 12, alignItems: "flex-start" },
    error: { fontSize: 14, color: t.destructiveText },
    retryButton: {
      height: 36,
      paddingHorizontal: 16,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: t.fgAlpha(0.2),
      alignItems: "center",
      justifyContent: "center",
    },
    retryButtonText: { fontSize: 14, fontWeight: "500", color: t.foreground },
    disabled: { opacity: 0.5 },
  });
