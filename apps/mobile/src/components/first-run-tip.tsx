import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";

import { type Theme, useThemedStyles } from "@/lib/theme";

// **初めての人にだけ出す案内**（docs/ui-guidelines.md「初めての人にだけ出す案内」）。
//
// 出すかどうかは呼ぶ側が**状態**で決める（その機能が今この画面で意味を持つか ×
// その人がまだ使っていないか）。出来事をきっかけに出すと、その瞬間に画面を見て
// いた人にしか届かない——あとから開いた人には何も起きない。
//
// 見た目はポップオーバーの段（サーフェス・強い影・角丸）。暗い浮遊チップは
// 「自分から消えるもの」（トースト）と「押している間だけ出るもの」（HelpTip）で、
// **消すまで居座って何かを指すもの**は、指し先と地続きに見せる。
export function FirstRunTip({
  children,
  onDismiss,
  style,
}: {
  children: string;
  onDismiss: () => void;
  // 指す相手の下に置く位置（呼ぶ側が絶対座標で決める）。
  style?: { top: number; left: number; width?: number };
}) {
  const t = useTranslations("common");
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.wrap, style]} pointerEvents="box-none">
      {/* 指す相手を向く三角。四角を45°回して角を出す（影は本体側だけに付ける）。 */}
      <View style={styles.arrow} />
      <View style={styles.bubble}>
        <Text style={styles.text}>{children}</Text>
        <Pressable
          onPress={onDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
          style={styles.action}
        >
          <Text style={styles.actionLabel}>{t("gotIt")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: { position: "absolute", zIndex: 20, width: 232 },
    arrow: {
      position: "absolute",
      top: -4,
      left: 14,
      width: 10,
      height: 10,
      transform: [{ rotate: "45deg" }],
      // 暗い地では影がほとんど効かないので、浮きは一段明るい面で出す
      // （ライトは地色のまま＝影で浮かせる）。
      backgroundColor: t.dark ? t.secondary : t.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderColor: t.fgAlpha(0.1),
    },
    bubble: {
      backgroundColor: t.dark ? t.secondary : t.background,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.fgAlpha(0.1),
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 6,
      shadowColor: "#000",
      shadowOpacity: t.dark ? 0.4 : 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    text: { fontSize: 12, lineHeight: 19, color: t.foreground },
    action: { alignSelf: "flex-end", paddingVertical: 6, paddingHorizontal: 4 },
    actionLabel: { fontSize: 12, fontWeight: "600", color: t.linkText },
  });
