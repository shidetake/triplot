import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { CopySourceTrip } from "@triplot/shared/copySourceLabel";
import { buildCopySourceLabels } from "@triplot/shared/copySourceLabel";

import { CheckIcon, ChevronIcon, XIcon } from "./icons";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";

// コピー元の旅行選択（トリガー＋モーダルリスト。CurrencyPickerModal と同形）。
// web の CreateTripForm の native <select> に対応する RN 版。
export function CopySourceTrigger({
  trips,
  value,
  onPress,
  placeholder,
}: {
  trips: CopySourceTrip[];
  value: string;
  onPress: () => void;
  placeholder: string;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const label = value
    ? (buildCopySourceLabels(trips).get(value) ?? value)
    : placeholder;
  return (
    <Pressable onPress={onPress} style={styles.trigger}>
      <Text
        style={[styles.triggerText, !value && styles.triggerPlaceholder]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <ChevronIcon size={16} rotate={90} color={theme.subtleForeground} />
    </Pressable>
  );
}

export function CopySourceModal({
  visible,
  trips,
  value,
  onSelect,
  onClose,
  title,
}: {
  visible: boolean;
  trips: CopySourceTrip[];
  value: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  title: string;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const labels = buildCopySourceLabels(trips);
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="閉じる">
            <XIcon size={20} color={theme.mutedForeground} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.list}>
          {trips.map((tr) => (
            <Pressable
              key={tr.id}
              onPress={() => {
                onSelect(tr.id);
                onClose();
              }}
              style={styles.row}
            >
              <Text style={styles.name} numberOfLines={1}>
                {labels.get(tr.id) ?? tr.title}
              </Text>
              {tr.id === value && (
                <CheckIcon size={16} color={theme.foreground} />
              )}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    sheet: { flex: 1, backgroundColor: t.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.fgAlpha(0.1),
    },
    title: { fontSize: 15, fontWeight: "600", color: t.foreground },
    list: { padding: 16, paddingTop: 4 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.fgAlpha(0.08),
    },
    name: { flex: 1, fontSize: 15, color: t.foreground },
    trigger: {
      height: 36,
      borderWidth: 1,
      borderColor: t.fgAlpha(0.2),
      borderRadius: 6,
      paddingHorizontal: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 6,
    },
    triggerText: { flex: 1, fontSize: 14, color: t.foreground },
    triggerPlaceholder: { color: t.subtleForeground },
  });
