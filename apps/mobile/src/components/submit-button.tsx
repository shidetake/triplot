import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from "react-native";

import { useDelayedBusy } from "@/lib/useDelayedBusy";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";

// フォームの送信ボタン（アイコンのみ）。処理が閾値より長引いた時だけ、中身を
// 同じ寸法のインジケータに差し替える（規約は docs/ui-guidelines.md の
// 「処理中（ローディング）」＝ボタン内インジケータが第一選択、速い処理には
// 何も出さない）。
//
// disabled は busy とは別に受ける: 必須が埋まっていない間も押せなくするが、
// その時はインジケータを出さない（処理していないため）。
export function SubmitButton({
  onPress,
  busy = false,
  disabled = false,
  accessibilityLabel,
  style,
  children,
}: {
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  accessibilityLabel: string;
  style?: ViewStyle | ViewStyle[];
  // 通常時に出すアイコン（保存＝SaveIcon / 追加＝PlusIcon 等）。
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const showBusy = useDelayedBusy(busy);
  const isDisabled = busy || disabled;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isDisabled, busy }}
      style={[styles.button, style, isDisabled && styles.disabled]}
    >
      {showBusy ? (
        <ActivityIndicator size="small" color={theme.primaryForeground} />
      ) : (
        children
      )}
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    button: {
      height: 44,
      borderRadius: 6,
      backgroundColor: t.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    disabled: { opacity: 0.5 },
  });
