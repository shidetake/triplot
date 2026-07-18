import { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTranslations } from "use-intl";

import { addTripPinOption, removeTripPinOption } from "@triplot/shared/data/places";
import {
  ICON_CATALOG,
  getIcon,
  getIconPath,
  type PinOption,
} from "@triplot/shared/placeIcons";

import { XIcon } from "./icons";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";

// 場所ピンの管理ピッカー（RN）。web の place-icon-picker と同機能:
// カタログ全件をグリッド表示、追加済みは fade＋赤（削除候補）、未追加は青（追加
// 候補）。1 つのアクションボタンで add/remove 両対応にして追加用バッジのノイズを避ける。
// pinKeys/pinOptions の単一の真実は trip_pin_options（DB）で、add/remove 後は親が
// invalidate して pinOptions を更新する。
export function PlaceIconPicker({
  visible,
  tripId,
  pinOptions,
  onAdded,
  onChanged,
  onClose,
}: {
  visible: boolean;
  tripId: string;
  pinOptions: PinOption[];
  // 追加成功時（親: ピッカーを閉じてそのアイコンを選択＋invalidate）。
  onAdded: (iconKey: string) => void;
  // 追加/削除でセットが変わったとき（親: invalidate して pinOptions を更新）。
  onChanged: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("place");
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const optionByIcon = new Map(pinOptions.map((o) => [o.icon, o]));
  const selectedOption = selected ? optionByIcon.get(selected) : null;
  const mode: "add" | "remove" = selectedOption ? "remove" : "add";

  const submit = () => {
    if (!selected || busy) return;
    if (selectedOption) {
      // 削除（確認を挟む）
      const entry = getIcon(selected);
      const name = entry ? t(`icon.${entry.key}`) : selectedOption.label;
      Alert.alert(
        t("iconPickerRemoveTitle", { name }),
        t("iconPickerRemoveBody"),
        [
          { text: "キャンセル", style: "cancel" },
          {
            text: t("iconPickerRemoveConfirm"),
            style: "destructive",
            onPress: () => {
              setBusy(true);
              void removeTripPinOption(
                supabase,
                tripId,
                selectedOption.id,
              ).then((r) => {
                setBusy(false);
                if (!r.ok) {
                  Alert.alert(t(r.error));
                  return;
                }
                // 削除後はそのアイコンが「未追加」に変わるので選択も解除
                setSelected(null);
                onChanged();
              });
            },
          },
        ],
      );
    } else {
      // 追加
      setBusy(true);
      void addTripPinOption(supabase, tripId, selected).then((r) => {
        setBusy(false);
        if (!r.ok) {
          Alert.alert(t(r.error));
          return;
        }
        onChanged();
        onAdded(selected);
      });
    }
  };

  const selectedEntry = selected ? getIcon(selected) : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("iconPickerAria")}</Text>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityLabel="閉じる"
          >
            <XIcon size={20} color={theme.mutedForeground} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.grid}>
          {ICON_CATALOG.filter((it) => it.key !== "pin").map((it) => {
            const used = optionByIcon.has(it.key);
            const sel = selected === it.key;
            // 選択ハイライト: 未追加=青（追加候補）、追加済=赤（削除候補）。
            const cellStyle = sel
              ? used
                ? { backgroundColor: theme.removeChipBg }
                : { backgroundColor: theme.addChipBg }
              : null;
            // 追加済みは「状態 dim」＝アイコンを opacity 0.5。
            const iconColor = theme.foreground;
            return (
              <Pressable
                key={it.key}
                onPress={() => setSelected(it.key)}
                disabled={busy}
                style={styles.cell}
                accessibilityLabel={t(`icon.${it.key}`)}
              >
                <View style={[styles.chip, cellStyle]}>
                  <Svg
                    viewBox="0 -960 960 960"
                    width={22}
                    height={22}
                    opacity={used ? 0.5 : 1}
                  >
                    <Path d={getIconPath(it.key)} fill={iconColor} />
                  </Svg>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.selectedRow}>
            <Text style={styles.selectedLabel}>{t("iconPickerSelected")}</Text>
            {selectedEntry ? (
              <>
                <Svg viewBox="0 -960 960 960" width={20} height={20}>
                  <Path d={getIconPath(selectedEntry.key)} fill={theme.foreground} />
                </Svg>
                <Text style={styles.selectedName}>
                  {t(`icon.${selectedEntry.key}`)}
                </Text>
              </>
            ) : (
              <Text style={styles.selectedNone}>{t("iconPickerNone")}</Text>
            )}
          </View>
          <Pressable
            onPress={submit}
            disabled={!selected || busy}
            style={[
              styles.actionButton,
              mode === "remove" ? styles.actionRemove : styles.actionAdd,
              (!selected || busy) && styles.actionDisabled,
            ]}
          >
            <Text
              style={[
                styles.actionText,
                mode === "remove" ? styles.actionRemoveText : styles.actionAddText,
              ]}
            >
              {mode === "remove" ? t("iconPickerRemoveConfirm") : t("addIconAria")}
            </Text>
          </Pressable>
        </View>
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
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      padding: 8,
    },
    cell: {
      width: `${100 / 8}%`,
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    chip: {
      width: 40,
      height: 40,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.fgAlpha(0.1),
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 24,
      gap: 10,
    },
    selectedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    selectedLabel: { fontSize: 12, color: t.mutedForeground },
    selectedName: { fontSize: 12, fontWeight: "500", color: t.foreground },
    selectedNone: { fontSize: 12, color: t.subtleForeground },
    actionButton: {
      height: 44,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    actionAdd: { backgroundColor: t.primary },
    actionAddText: { color: t.primaryForeground },
    actionRemove: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: t.destructiveBorder,
    },
    actionRemoveText: { color: t.destructiveText },
    actionText: { fontSize: 14, fontWeight: "600" },
    actionDisabled: { opacity: 0.5 },
  });
