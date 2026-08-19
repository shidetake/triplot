import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/lib/theme";
import { badgeStyle } from "@/lib/themeColor";

// 色付きの丸ピル／丸チップ（web の components/color-badge.tsx と対）。
// 渡された色からは**色相だけ**を使い、面と文字の明度・彩度は役割ラダー
// （colorRoles.ts）が決める。以前は渡された色をそのまま地にして白文字を
// 乗せていたが、それだと地色次第でコントラストが 2.15:1 まで落ちて
// WCAG 1.4.3 を満たせなかった。

export function ColorBadge({
  color,
  icon,
  children,
}: {
  color: string;
  icon?: (glyphColor: string) => ReactNode;
  children: string;
}) {
  const t = useTheme();
  const s = badgeStyle(color, t.dark);
  return (
    <View style={[styles.badge, { backgroundColor: s.backgroundColor }]}>
      {icon?.(s.color)}
      <Text style={[styles.badgeText, { color: s.color }]}>{children}</Text>
    </View>
  );
}

// アイコンだけの丸チップ（カテゴリ選択・カテゴリ管理の行頭）。
export function ColorDisc({
  color,
  size,
  children,
}: {
  color: string;
  size: number;
  children: (glyphColor: string) => ReactNode;
}) {
  const t = useTheme();
  const s = badgeStyle(color, t.dark);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: s.backgroundColor,
      }}
    >
      {children(s.color)}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 12, fontWeight: "500" },
});
