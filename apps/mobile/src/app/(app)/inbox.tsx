import * as Clipboard from "expo-clipboard";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTranslations } from "use-intl";

import {
  assignInboundEmailTrip,
  dismissInboundEmail,
} from "@triplot/shared/data/inbox";
import { fetchImportInboxRows } from "@triplot/shared/data/reads/inbox";
import { buildImportAddress } from "@triplot/shared/importAddress";

import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";

// 受信箱（メール取り込み）。web の /import 相当（M8 スコープ = 割当/破棄/
// アドレス表示。確定は各旅行の画面で）。
export default function InboxScreen() {
  const t = useTranslations("import");
  const { session } = useSession();
  const userId = session?.user.id;

  const { data, refetch, isRefetching } = useQuery({
    queryKey: ["inbox", userId],
    queryFn: () => fetchImportInboxRows(supabase, userId!),
    enabled: !!userId,
  });

  const [assigning, setAssigning] = useState<string | null>(null);

  const address = data?.importToken
    ? buildImportAddress(data.importToken)
    : null;
  const trips = data?.trips ?? [];
  const emails = data?.emails ?? [];

  // メール単位に下書きをまとめて要約（web の rows 組み立ての簡略版）。
  const itemsByEmail = new Map<string, { kind: string; payload: unknown }[]>();
  for (const d of data?.draftRows ?? []) {
    const arr = itemsByEmail.get(d.email_id) ?? [];
    arr.push(d);
    itemsByEmail.set(d.email_id, arr);
  }

  const copyAddress = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    Alert.alert("コピーしました");
  };

  const assign = async (emailId: string, tripId: string | null) => {
    const r = await assignInboundEmailTrip(supabase, emailId, tripId);
    if (!r.ok) {
      Alert.alert(r.error);
      return;
    }
    setAssigning(null);
    void refetch();
  };

  const dismiss = (emailId: string) => {
    Alert.alert(t("dismissEmailTitle"), undefined, [
      { text: "キャンセル", style: "cancel" },
      {
        text: t("dismiss"),
        style: "destructive",
        onPress: () => {
          void dismissInboundEmail(supabase, emailId).then((r) => {
            if (!r.ok) {
              Alert.alert(t("dismissFailed", { error: r.error }));
              return;
            }
            void refetch();
          });
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
        />
      }
    >

      <Text style={styles.description}>{t("description")}</Text>

      {/* 転送先アドレス */}
      {address && (
        <View style={styles.addressBox}>
          <Text style={styles.addressLabel}>{t("forwardLabel")}</Text>
          <Text style={styles.address} selectable>
            {address}
          </Text>
          <Pressable onPress={() => void copyAddress()} style={styles.copyButton}>
            <Text style={styles.copyLabel}>{t("copyAddress")}</Text>
          </Pressable>
        </View>
      )}

      {/* メール一覧 */}
      {emails.length === 0 ? (
        <Text style={styles.empty}>{t("emptyState")}</Text>
      ) : (
        emails.map((e) => {
          const items = itemsByEmail.get(e.id) ?? [];
          const receipt = items.find((i) => i.kind === "expense")?.payload as
            | { merchant?: string; total?: number; currency?: string }
            | undefined;
          const eventItems = items.filter((i) => i.kind === "event");
          const summary =
            receipt?.merchant ||
            (eventItems[0]?.payload as { title?: string } | undefined)
              ?.title ||
            e.subject ||
            t("noContent");
          const assigned = trips.find((tr) => tr.id === e.trip_id);
          return (
            <View key={e.id} style={styles.emailCard}>
              <Text style={styles.emailSummary} numberOfLines={1}>
                {summary}
              </Text>
              <View style={styles.emailMeta}>
                {receipt?.total != null && (
                  <Text style={styles.metaText}>
                    {receipt.total} {receipt.currency}
                  </Text>
                )}
                <Text style={styles.metaText}>
                  {String(e.received_at).slice(5, 10).replace("-", "/")}
                </Text>
                {items.length > 1 && (
                  <Text style={styles.metaText}>{items.length}件</Text>
                )}
              </View>

              {/* 旅行割当 */}
              {assigning === e.id ? (
                <View style={styles.tripChoices}>
                  {trips.map((tr) => (
                    <Pressable
                      key={tr.id}
                      onPress={() => void assign(e.id, tr.id)}
                      style={styles.tripChoice}
                    >
                      <Text style={styles.tripChoiceLabel}>{tr.title}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <View style={styles.actionsRow}>
                  <Pressable
                    onPress={() => setAssigning(e.id)}
                    style={[
                      styles.assignButton,
                      !assigned && styles.assignButtonWarn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.assignLabel,
                        !assigned && styles.assignLabelWarn,
                      ]}
                    >
                      {assigned
                        ? t("confirmAtTrip", { title: assigned.title })
                        : t("needsAssignment")}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => dismiss(e.id)} hitSlop={8}>
                    <Text style={styles.dismissLabel}>{t("dismiss")}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })
      )}

      {/* 使用量 */}
      {data && (
        <Text style={styles.usage}>
          {t("usageCount", { used: data.usedThisMonth ?? 0, cap: 30 })}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // モーダルの地色はアプリ本体と同じ白（ナビバー帯とコンテンツ部で色が
  // 割れて見えるのを防ぐ）。
  screen: { backgroundColor: "#fff" },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  description: { fontSize: 12, color: "rgba(0,0,0,0.6)" },
  addressBox: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: 6,
    padding: 12,
    gap: 6,
  },
  addressLabel: { fontSize: 12, color: "rgba(0,0,0,0.6)" },
  address: { fontSize: 13, fontVariant: ["tabular-nums"] },
  copyButton: {
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  copyLabel: { fontSize: 12, fontWeight: "500" },
  empty: { fontSize: 13, color: "rgba(0,0,0,0.6)", paddingVertical: 16 },
  emailCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.15)",
    borderRadius: 6,
    padding: 12,
    gap: 6,
  },
  emailSummary: { fontSize: 14, fontWeight: "500" },
  emailMeta: { flexDirection: "row", gap: 10 },
  metaText: { fontSize: 12, color: "rgba(0,0,0,0.55)" },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  assignButton: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  assignButtonWarn: { backgroundColor: "#fef3c7" },
  assignLabel: { fontSize: 12, fontWeight: "500" },
  assignLabelWarn: { color: "#b45309" },
  dismissLabel: { fontSize: 12, color: "rgba(0,0,0,0.5)" },
  tripChoices: { gap: 6 },
  tripChoice: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    borderRadius: 6,
    padding: 10,
  },
  tripChoiceLabel: { fontSize: 13 },
  usage: { fontSize: 11, color: "rgba(0,0,0,0.5)", marginTop: 8 },
});
