import * as Clipboard from "expo-clipboard";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";

import {
  assignInboundEmailTrip,
  dismissInboundEmail,
} from "@triplot/shared/data/inbox";
import { fetchImportInboxRows } from "@triplot/shared/data/reads/inbox";
import {
  EXTRACT_ERROR_NO_CONTENT,
  MONTHLY_EMAIL_CAP,
} from "@triplot/shared/import/config";
import { buildImportAddress } from "@triplot/shared/importAddress";

import { SheetTitle } from "@/components/sheet-title";
import { supabase } from "@/lib/supabase";
import { type Theme, useThemedStyles } from "@/lib/theme";
import { useSession } from "@/lib/session";

// 受信箱（メール取り込み、FormSheet の中身）。web の /import 相当
// （M8 スコープ = 割当/破棄/アドレス表示。確定は各旅行の画面で）。
// pull-to-refresh の RefreshControl は呼び出し元（trips/index.tsx）が
// FormSheet の refreshControl prop として渡す（RefreshControl は
// ScrollView 直下の prop としてしか機能しないため）。同じ queryKey で
// useQuery を呼ぶことで TanStack Query のキャッシュ共有により二重取得
// にはならず、呼び出し元の refetch がこのコンポーネントの data も更新する。
export function InboxSheet() {
  const t = useTranslations("import");
  const styles = useThemedStyles(makeStyles);
  const { session } = useSession();
  const userId = session?.user.id;

  const { data, refetch } = useQuery({
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
    <View style={styles.content}>
      <SheetTitle>{t("heading")}</SheetTitle>

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

      {/* 上限超過の警告（web の overQuotaWarning と同じ） */}
      {(data?.overQuota ?? 0) > 0 && (
        <View style={styles.warnBox}>
          <Text style={styles.warnText}>
            {t("overQuotaWarning", {
              cap: MONTHLY_EMAIL_CAP,
              over: data?.overQuota ?? 0,
            })}
          </Text>
        </View>
      )}

      {/* 取り込みに失敗したメール（web のエラー行と同じ。× で破棄） */}
      {(data?.errorRows ?? []).map((e) => (
        <View key={e.id} style={styles.errorCard}>
          <View style={styles.errorBody}>
            <Text style={styles.emailSummary} numberOfLines={1}>
              {e.subject || e.sender || t("unknownMerchant")}
            </Text>
            <Text style={styles.errorText}>
              {e.extract_error === EXTRACT_ERROR_NO_CONTENT
                ? t("errorNoContent")
                : e.next_retry_at
                  ? t("errorWillRetry")
                  : t("errorNoRetry")}
            </Text>
          </View>
          <Pressable
            onPress={() => dismiss(e.id)}
            hitSlop={8}
            accessibilityLabel={t("dismiss")}
          >
            <Text style={styles.dismissLabel}>{t("dismiss")}</Text>
          </Pressable>
        </View>
      ))}

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
          {t("usageCount", {
            used: data.usedThisMonth ?? 0,
            cap: MONTHLY_EMAIL_CAP,
          })}
        </Text>
      )}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  content: { paddingHorizontal: 16, gap: 12 },
  description: { fontSize: 12, color: t.mutedForeground },
  addressBox: {
    borderWidth: 1,
    borderColor: t.fgAlpha(0.1),
    borderRadius: 6,
    padding: 12,
    gap: 6,
  },
  addressLabel: { fontSize: 12, color: t.mutedForeground },
  address: { fontSize: 13, fontVariant: ["tabular-nums"], color: t.foreground },
  copyButton: {
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: t.fgAlpha(0.2),
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  copyLabel: { fontSize: 12, fontWeight: "500", color: t.foreground },
  empty: { fontSize: 13, color: t.mutedForeground, paddingVertical: 16 },
  // 上限超過の警告（amber。web の MessageBox kind="warning" と同段）。
  warnBox: {
    borderWidth: 1,
    borderColor: t.warnBorder,
    backgroundColor: t.warnBg,
    borderRadius: 6,
    padding: 10,
  },
  warnText: { fontSize: 12, color: t.warnText },
  // 取り込み失敗メール（red。web のエラー行と同じ薄い赤面＋赤枠）。
  errorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderColor: t.destructiveBorder,
    backgroundColor: t.errorBg,
    borderRadius: 6,
    padding: 12,
  },
  errorBody: { flex: 1, gap: 2 },
  errorText: { fontSize: 12, color: t.errorText },
  emailCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.fgAlpha(0.15),
    borderRadius: 6,
    padding: 12,
    gap: 6,
  },
  emailSummary: { fontSize: 14, fontWeight: "500", color: t.foreground },
  emailMeta: { flexDirection: "row", gap: 10 },
  metaText: { fontSize: 12, color: t.mutedForeground },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  assignButton: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: t.fgAlpha(0.05),
  },
  assignButtonWarn: { backgroundColor: t.warnChipBg },
  assignLabel: { fontSize: 12, fontWeight: "500", color: t.foreground },
  assignLabelWarn: { color: t.warnAccent },
  dismissLabel: { fontSize: 12, color: t.mutedForeground },
  tripChoices: { gap: 6 },
  tripChoice: {
    borderWidth: 1,
    borderColor: t.fgAlpha(0.15),
    borderRadius: 6,
    padding: 10,
  },
  tripChoiceLabel: { fontSize: 13, color: t.foreground },
  usage: { fontSize: 11, color: t.mutedForeground, marginTop: 8 },
});
