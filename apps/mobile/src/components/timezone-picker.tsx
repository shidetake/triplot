import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  TZ_GROUPS,
  tzDisplayLabel,
  type TzGroup,
  type TzSubGroup,
} from "@triplot/shared/timezones";

import { CheckIcon, ChevronIcon } from "./icons";
import { useTranslations } from "use-intl";

import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
import { PageSheet } from "./page-sheet";

// タイムゾーンピッカー（RN・時差移動の出発/到着TZ用）。web と同じ3段ドリルダウン
// （大陸グループ → サブ地域 → ゾーン）。データは shared/timezones（単一の真実）。
//
// タイムゾーン選択。器は PageSheet（なぜ他のシートと違う API を使うかは
// そちらのコメント参照）。
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
      <Pressable onPress={() => setOpen(true)} style={styles.trigger}>
        <Text style={styles.triggerText} numberOfLines={1}>
          {tzDisplayLabel(value)}
        </Text>
        <ChevronIcon size={16} color={t.subtleForeground} rotate={90} />
      </Pressable>

      {/* 器は PageSheet（通貨・コピー元・カテゴリと共用。取っ手と中央寄せの
          見出しを1箇所に集約している）。 */}
      <PageSheet
        visible={open}
        onClose={close}
        title={tEvent("timezonePickerTitle")}
      >
        <ScrollView contentContainerStyle={styles.list}>
          {!group ? (
            TZ_GROUPS.map((g) => (
              <Row
                key={g.label}
                label={g.label}
                onPress={() => setGroup(g)}
                chevron
              />
            ))
          ) : !subGroup ? (
            <>
              <Row label={group.label} onPress={() => setGroup(null)} back />
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
      </PageSheet>
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
      {back && <ChevronIcon size={16} color={t.mutedForeground} rotate={180} />}
      <Text style={[styles.rowLabel, back && styles.rowLabelBack]}>
        {label}
      </Text>
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
