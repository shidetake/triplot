import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  TZ_GROUPS,
  tzDisplayLabel,
  type TzGroup,
  type TzSubGroup,
} from "@triplot/shared/timezones";

import { CheckIcon, ChevronIcon } from "./icons";
import { useTranslations } from "use-intl";

import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";

// タイムゾーンピッカー（RN・時差移動の出発/到着TZ用）。web と同じ3段ドリルダウン
// （大陸グループ → サブ地域 → ゾーン）。データは shared/timezones（単一の真実）。
//
// RN の Modal(presentationStyle="pageSheet") は iOS の UIModalPresentation
// PageSheet を使う実物の native シート（他の formSheet と同じ「本物」）だが、
// react-native-screens の ScreenStackItem/sheetAllowedDetents のような
// 新しい多段 detent API とは別物。event-form 等、既に formSheet として
// 開いている画面の中からさらに ScreenStack を入れ子にして開こうとしたところ、
// 元の画面と二重露光のように重なって描画される不具合が実機検証で確認できた
// （react-native-screens の formSheet の中にさらに別の ScreenStack を
// 入れ子にする構成は非対応と判断）ため、この Modal 実装のまま「取っ手を
// 足す・キャンセルボタンを外す」という見た目だけ他の native シートに
// 揃える対応にとどめている。
export function TimezonePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (iana: string) => void;
}) {
  const t = useTheme();
  const tEvent = useTranslations("event");
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<TzGroup | null>(null);
  const [subGroup, setSubGroup] = useState<TzSubGroup | null>(null);

  const close = () => {
    setOpen(false);
    setGroup(null);
    setSubGroup(null);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={styles.trigger}
      >
        <Text style={styles.triggerText} numberOfLines={1}>
          {tzDisplayLabel(value)}
        </Text>
        <ChevronIcon size={16} color={t.subtleForeground} rotate={90} />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={close}
      >
        <View style={styles.modalRoot}>
          {/* 取っ手（native formSheet の sheetGrabberVisible と同じ見た目）。
              キャンセルボタンは置かず、他の native シートと同じくスワイプで
              閉じる。 */}
          <View style={styles.grabberRow}>
            <View style={styles.grabber} />
          </View>
          <Text style={styles.modalTitle}>{tEvent("timezonePickerTitle")}</Text>
          <ScrollView contentContainerStyle={styles.list}>
            {!group ? (
              TZ_GROUPS.map((g) => (
                <Row key={g.label} label={g.label} onPress={() => setGroup(g)} chevron />
              ))
            ) : !subGroup ? (
              <>
                <Row
                  label={group.label}
                  onPress={() => setGroup(null)}
                  back
                />
                {group.subGroups.map((sg) => (
                  <Row
                    key={sg.label}
                    label={sg.label}
                    onPress={() => setSubGroup(sg)}
                    chevron
                  />
                ))}
              </>
            ) : (
              <>
                <Row
                  label={subGroup.label}
                  onPress={() => setSubGroup(null)}
                  back
                />
                {subGroup.zones.map((z) => (
                  <Pressable
                    key={z.iana}
                    onPress={() => {
                      onChange(z.iana);
                      close();
                    }}
                    style={styles.zoneRow}
                  >
                    <View style={styles.zoneInfo}>
                      <Text style={styles.zoneName}>{z.name}</Text>
                      {z.sub ? <Text style={styles.zoneSub}>{z.sub}</Text> : null}
                    </View>
                    {z.iana === value && (
                      <CheckIcon size={16} color={t.mutedForeground} />
                    )}
                  </Pressable>
                ))}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

function Row({
  label,
  onPress,
  chevron,
  back,
}: {
  label: string;
  onPress: () => void;
  chevron?: boolean;
  back?: boolean;
}) {
  const t = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable onPress={onPress} style={styles.row}>
      {back && (
        <ChevronIcon size={16} color={t.mutedForeground} rotate={180} />
      )}
      <Text style={[styles.rowLabel, back && styles.rowLabelBack]}>{label}</Text>
      {chevron && (
        <ChevronIcon size={16} color={t.subtleForeground} rotate={90} />
      )}
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    trigger: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      height: 36,
      borderWidth: 1,
      borderColor: t.fgAlpha(0.2),
      borderRadius: 6,
      paddingHorizontal: 10,
    },
    triggerText: { fontSize: 14, flex: 1, color: t.foreground },
    modalRoot: { flex: 1, backgroundColor: t.background },
    grabberRow: { alignItems: "center", paddingTop: 8, paddingBottom: 4 },
    grabber: {
      width: 36,
      height: 5,
      borderRadius: 3,
      backgroundColor: t.fgAlpha(0.2),
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: "600",
      color: t.foreground,
      textAlign: "center",
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.fgAlpha(0.1),
    },
    list: { paddingVertical: 8 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.fgAlpha(0.06),
    },
    rowLabel: { flex: 1, fontSize: 14, color: t.foreground },
    rowLabelBack: { fontWeight: "600" },
    zoneRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.fgAlpha(0.06),
    },
    zoneInfo: { flex: 1 },
    zoneName: { fontSize: 14, color: t.foreground },
    zoneSub: { fontSize: 12, color: t.mutedForeground, marginTop: 2 },
  });
