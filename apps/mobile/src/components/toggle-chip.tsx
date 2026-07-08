import { Pressable, StyleSheet, Text } from "react-native";

import { chipStyle } from "@triplot/shared/memberColors";

// メンバー選択のトグルチップ（web の components/toggle-chip.tsx 相当）。
// 非選択＝muted+輪郭、選択＝hue があればメンバー色の薄い面、無ければ primary 塗り。
export function ToggleChip({
  on,
  hue,
  label,
  onPress,
}: {
  on: boolean;
  hue?: number | null;
  label: string;
  onPress: () => void;
}) {
  const member = on && hue != null ? (chipStyle(hue) as {
    backgroundColor?: string;
    color?: string;
  }) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[
        styles.chip,
        on
          ? member
            ? { backgroundColor: member.backgroundColor }
            : styles.chipOnPrimary
          : styles.chipOff,
      ]}
    >
      <Text
        style={[
          styles.label,
          on
            ? member
              ? { color: member.color }
              : styles.labelOnPrimary
            : styles.labelOff,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipOff: {
    backgroundColor: "rgba(0,0,0,0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.15)",
  },
  chipOnPrimary: { backgroundColor: "#09090b" },
  label: { fontSize: 12, fontWeight: "500" },
  labelOff: { color: "rgba(0,0,0,0.55)" },
  labelOnPrimary: { color: "#fff" },
});
