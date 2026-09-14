import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";

import { XIcon } from "@/components/icons";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";

// **初めての人にだけ出す案内**（docs/ui-guidelines.md「初めての人にだけ出す案内」）。
//
// 出すかどうかは呼ぶ側が**状態**で決める（その機能が今この画面で意味を持つか ×
// その人がまだ使っていないか）。出来事をきっかけに出すと、その瞬間に画面を見て
// いた人にしか届かない——あとから開いた人には何も起きない。
//
// 見た目はポップオーバーの段（サーフェス・強い影・角丸）。暗い浮遊チップは
// 「自分から消えるもの」（トースト）と「押している間だけ出るもの」（HelpTip）で、
// **消すまで居座って何かを指すもの**は、指し先と地続きに見せる。
//
// **指している相手の側の角を尖らせる**（漫画の吹き出しと同じ）。矢印を別に
// 添えるより、器そのものが向きを持つ方が「これはあれの説明だ」と分かる。
export function FirstRunTip({
  children,
  onDismiss,
  style,
}: {
  children: string;
  onDismiss: () => void;
  // 指す相手の右下に置く位置（呼ぶ側が絶対座標で決める）。尖った角が
  // 相手の方（左上）を向く。
  style?: { top: number; left: number };
}) {
  const t = useTranslations("common");
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.bubble}>
        {/* 尖った角。四角を45°回して左上の角から覗かせる＝器の角がそのまま
            尖って見える（角丸を落としてあるので継ぎ目が出ない）。 */}
        <View style={styles.tail} />
        <Text style={styles.text}>{children}</Text>
        <Pressable
          onPress={onDismiss}
          accessibilityLabel={t("close")}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.close}
        >
          <XIcon size={14} color={theme.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: { position: "absolute", zIndex: 20, width: 236 },
    bubble: {
      // 暗い地では影がほとんど効かないので、浮きは一段明るい面で出す
      // （ライトは地色のまま＝影で浮かせる）。
      backgroundColor: t.dark ? t.secondary : t.background,
      borderRadius: 10,
      // 指す相手の側だけ角を落とす＝そこが尖って見える。
      borderTopLeftRadius: 0,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.fgAlpha(0.1),
      paddingHorizontal: 12,
      paddingVertical: 10,
      paddingRight: 32,
      shadowColor: "#000",
      shadowOpacity: t.dark ? 0.4 : 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    tail: {
      position: "absolute",
      top: -7,
      left: -7,
      width: 14,
      height: 14,
      transform: [{ rotate: "45deg" }],
      backgroundColor: t.dark ? t.secondary : t.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderColor: t.fgAlpha(0.1),
    },
    text: { fontSize: 12, lineHeight: 19, color: t.foreground },
    close: { position: "absolute", top: 8, right: 8 },
  });
