import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  ALL_CURRENCIES,
  COMMON_CURRENCIES,
  CURRENCY_NAMES,
} from "@triplot/shared/currencies";
import type { Currency } from "@triplot/shared/types/database";

import { CheckIcon, ChevronIcon, XIcon } from "./icons";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";

// 主要通貨 → その他全通貨（web の CurrencySelect と同じ並び。COMMON_CURRENCIES
// の重複を除く）。呼び出しごとに作り直さないようモジュール定数にする。
const CURRENCY_CHOICES: Currency[] = [
  ...COMMON_CURRENCIES,
  ...ALL_CURRENCIES.filter((c) => !COMMON_CURRENCIES.includes(c)),
] as Currency[];

// 通貨選択モーダル（pageSheet・全170通貨から選べる）。expense-form の通貨/
// 精算通貨選択で共用する単一の真実（以前は旅行編集画面だけ6件に絞った独自
// chip 実装になっていた＝仕様の揺れ）。ヘッダーに × を置いて「選ばずに
// 閉じる」を明示（pageSheet の下スワイプでも閉じられるが分かりにくいため）。
// 各行は web と同じ「コード + 通貨名」。
export function CurrencyPickerModal({
  visible,
  value,
  onSelect,
  onClose,
  title,
}: {
  visible: boolean;
  value: string;
  onSelect: (code: Currency) => void;
  onClose: () => void;
  title: string;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
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
          {CURRENCY_CHOICES.map((c) => (
            <Pressable
              key={c}
              onPress={() => {
                onSelect(c);
                onClose();
              }}
              style={styles.row}
            >
              <Text style={[styles.code, c === value && styles.textOn]}>
                {c}
              </Text>
              <Text style={styles.name} numberOfLines={1}>
                {CURRENCY_NAMES[c] ?? ""}
              </Text>
              {c === value && <CheckIcon size={16} color={theme.foreground} />}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// トリガー（web の Select.Trigger 相当）。コード3文字のみ表示し、タップで
// モーダルを開く。旅行編集画面のような単独フィールドで使う。
export function CurrencyPickerTrigger({
  value,
  onPress,
  disabled,
}: {
  value: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.trigger, disabled && styles.triggerDisabled]}
    >
      <Text style={styles.triggerText}>{value}</Text>
      <ChevronIcon size={16} rotate={90} color={theme.subtleForeground} />
    </Pressable>
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
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.fgAlpha(0.08),
    },
    code: {
      fontSize: 15,
      color: t.foreground,
      fontVariant: ["tabular-nums"],
      width: 48,
    },
    name: { fontSize: 13, color: t.mutedForeground, flex: 1 },
    textOn: { fontWeight: "700" },
    trigger: {
      height: 36,
      borderWidth: 1,
      borderColor: t.fgAlpha(0.2),
      borderRadius: 6,
      paddingHorizontal: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 6,
      alignSelf: "flex-start",
      minWidth: 90,
    },
    triggerDisabled: { opacity: 0.5 },
    triggerText: {
      fontSize: 14,
      color: t.foreground,
      fontVariant: ["tabular-nums"],
    },
  });
