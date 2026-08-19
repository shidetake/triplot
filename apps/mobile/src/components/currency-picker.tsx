import { useMemo, useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useTranslations } from "use-intl";

import {
  ALL_CURRENCIES,
  COMMON_CURRENCIES,
  CURRENCY_NAMES,
} from "@triplot/shared/currencies";
import type { Currency } from "@triplot/shared/types/database";

import { CheckIcon, ChevronIcon, SearchIcon } from "./icons";
import { PageSheet } from "./page-sheet";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";

// 主要通貨 → その他全通貨（web の CurrencySelect と同じ並び。COMMON_CURRENCIES
// の重複を除く）。呼び出しごとに作り直さないようモジュール定数にする。
const CURRENCY_CHOICES: Currency[] = [
  ...COMMON_CURRENCIES,
  ...ALL_CURRENCIES.filter((c) => !COMMON_CURRENCIES.includes(c)),
] as Currency[];

// 通貨選択モーダル（pageSheet・全170通貨から選べる）。expense-form の通貨/
// 精算通貨選択で共用する単一の真実（以前は旅行編集画面だけ6件に絞った独自
// chip 実装になっていた＝仕様の揺れ）。
//
// 通貨選択（トリガー＋モーダルリスト）。器は PageSheet（コピー元選択と共用。
// なぜ他のシートと違う API を使うかはそちらのコメント参照）。
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
  const t = useTranslations("common");
  const tCurrency = useTranslations("currency");
  const styles = useThemedStyles(makeStyles);
  const [query, setQuery] = useState("");

  // コード（USD）or 通貨名（日本語/英語）の部分一致。170件をスクロールで
  // 探すのは辛いので検索を主役にする（右端の索引ジャンプは iOS 標準だが
  // RN 標準機能に無く、通貨コードは50音/アルファベット位置の感覚も
  // つかみにくいので採用しない）。
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CURRENCY_CHOICES;
    return CURRENCY_CHOICES.filter((c) => {
      const name = (CURRENCY_NAMES[c] ?? "").toLowerCase();
      return c.toLowerCase().includes(q) || name.includes(q);
    });
  }, [query]);

  const close = () => {
    setQuery("");
    onClose();
  };

  return (
    <PageSheet visible={visible} onClose={close} title={title}>
      <View style={styles.searchWrap}>
        <SearchIcon size={16} color={theme.subtleForeground} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("search")}
          placeholderTextColor={theme.subtleForeground}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>
      <ScrollView
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
      >
        {filtered.length === 0 ? (
          <Text style={styles.empty}>{tCurrency("noResults")}</Text>
        ) : (
          filtered.map((c) => {
            const selected = c === value;
            return (
              <Pressable
                key={c}
                onPress={() => {
                  onSelect(c);
                  close();
                }}
                style={[styles.row, selected && styles.rowSelected]}
              >
                <Text style={[styles.code, selected && styles.textOn]}>
                  {c}
                </Text>
                <Text
                  style={[styles.name, selected && styles.textOn]}
                  numberOfLines={1}
                >
                  {CURRENCY_NAMES[c] ?? ""}
                </Text>
                {selected && <CheckIcon size={16} color={theme.foreground} />}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </PageSheet>
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
      onPress={() => {
        Keyboard.dismiss();
        onPress();
      }}
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
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 16,
      paddingHorizontal: 10,
      height: 36,
      borderRadius: 8,
      backgroundColor: t.fgAlpha(0.06),
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: t.foreground,
      paddingVertical: 0,
    },
    empty: {
      paddingVertical: 24,
      textAlign: "center",
      fontSize: 14,
      color: t.mutedForeground,
    },
    list: { padding: 16, paddingTop: 12 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.fgAlpha(0.08),
    },
    // 選択中は地図フィルタの選択行と同じ bg-accent 相当＋太字（ui-guidelines
    // 「定型部品」の選択行表現に揃える）。以前はチェックマークだけで目立た
    // なかった（実機フィードバック）。
    rowSelected: { backgroundColor: t.secondary },
    code: {
      fontSize: 14,
      color: t.foreground,
      fontVariant: ["tabular-nums"],
      width: 48,
    },
    name: { fontSize: 14, color: t.mutedForeground, flex: 1 },
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
