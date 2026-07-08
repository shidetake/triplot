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

// タイムゾーンピッカー（RN・時差移動の出発/到着TZ用）。web と同じ3段ドリルダウン
// （大陸グループ → サブ地域 → ゾーン）。データは shared/timezones（単一の真実）。
export function TimezonePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (iana: string) => void;
}) {
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
        <ChevronIcon size={16} color="rgba(0,0,0,0.4)" rotate={90} />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={close}
      >
        <View style={styles.modalHeader}>
          <Pressable onPress={close} hitSlop={8}>
            <Text style={styles.cancel}>キャンセル</Text>
          </Pressable>
        </View>
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
                    <CheckIcon size={16} color="rgba(0,0,0,0.5)" />
                  )}
                </Pressable>
              ))}
            </>
          )}
        </ScrollView>
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
  return (
    <Pressable onPress={onPress} style={styles.row}>
      {back && (
        <ChevronIcon size={16} color="rgba(0,0,0,0.45)" rotate={180} />
      )}
      <Text style={[styles.rowLabel, back && styles.rowLabelBack]}>{label}</Text>
      {chevron && (
        <ChevronIcon size={16} color="rgba(0,0,0,0.3)" rotate={90} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 36,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.2)",
    borderRadius: 6,
    paddingHorizontal: 10,
  },
  triggerText: { fontSize: 14, flex: 1 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  cancel: { fontSize: 15, color: "#2563eb" },
  list: { paddingVertical: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  rowLabel: { flex: 1, fontSize: 15 },
  rowLabelBack: { fontWeight: "600" },
  zoneRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  zoneInfo: { flex: 1 },
  zoneName: { fontSize: 15 },
  zoneSub: { fontSize: 12, color: "rgba(0,0,0,0.5)", marginTop: 2 },
});
