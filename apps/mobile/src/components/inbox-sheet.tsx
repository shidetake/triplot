import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocale, useTranslations } from "use-intl";

import { buildCopySourceLabels } from "@triplot/shared/copySourceLabel";
import { dismissInboundEmail } from "@triplot/shared/data/inbox";
import { fetchImportInboxRows } from "@triplot/shared/data/reads/inbox";
import {
  EXTRACT_ERROR_NO_CONTENT,
  MONTHLY_EMAIL_CAP,
} from "@triplot/shared/import/config";
import { eventDraftWhenLabel } from "@triplot/shared/import/draftLabel";
import type { EventDraft, Receipt } from "@triplot/shared/import/schema";
import { buildImportAddress } from "@triplot/shared/importAddress";

import { ChevronIcon, CopyIcon } from "@/components/icons";
import { InlineDivider } from "@/components/inline-divider";
import { SheetTitle } from "@/components/sheet-title";
import { toast } from "@/components/toast";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
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
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { session } = useSession();
  const userId = session?.user.id;

  const { data, refetch } = useQuery({
    queryKey: ["inbox", userId],
    queryFn: () => fetchImportInboxRows(supabase, userId!),
    enabled: !!userId,
  });

  const address = data?.importToken
    ? buildImportAddress(data.importToken)
    : null;
  const trips = data?.trips ?? [];
  const emails = data?.emails ?? [];
  // 同名旅行を見分けやすいよう "Hawaii (2026, 7日間)" の形にする
  // （create-trip のコピー元選択と同じ関数。実機フィードバック: 同名の旅行が
  // 複数あると割当先の選択でどちらか分からなくなっていた）。
  const tripLabels = buildCopySourceLabels(trips);

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
    toast("コピーしました");
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
          <View style={styles.addressRow}>
            <Text style={styles.address} selectable numberOfLines={1}>
              {address}
            </Text>
            <Pressable
              onPress={() => void copyAddress()}
              style={styles.copyButton}
              accessibilityLabel={t("copyAddress")}
              hitSlop={8}
            >
              <CopyIcon size={16} color={theme.mutedForeground} />
            </Pressable>
          </View>
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
          const receipt = (items.find((i) => i.kind === "expense")?.payload ??
            null) as Receipt | null;
          const events = items
            .filter((i) => i.kind === "event")
            .map((i) => i.payload as EventDraft);
          const summary =
            receipt?.merchant ||
            events[0]?.title ||
            e.subject ||
            t("noContent");
          const assigned = trips.find((tr) => tr.id === e.trip_id);
          return (
            <View key={e.id} style={styles.emailCard}>
              <Text style={styles.emailSummary} numberOfLines={1}>
                {summary}
              </Text>
              {/* 抽出できた中身を web の /import と同じ粒度で出す（金額・日付・
                  カテゴリ・場所／予定は1件ずつタイトルと日時）。割り当て先を
                  決める判断材料なので、要約だけに削らない。 */}
              {receipt && (
                <View style={styles.emailMeta}>
                  <Text style={styles.metaText}>
                    {receipt.total} {receipt.currency}
                  </Text>
                  <InlineDivider />
                  <Text style={styles.metaText}>{receipt.date}</Text>
                  <InlineDivider />
                  <Text style={styles.metaText}>{receipt.category}</Text>
                  {receipt.location ? (
                    <>
                      <InlineDivider />
                      <Text style={styles.metaText} numberOfLines={1}>
                        {receipt.location}
                      </Text>
                    </>
                  ) : null}
                </View>
              )}
              {events.map((ev, i) => (
                <View key={i} style={styles.emailMeta}>
                  <Text style={styles.metaText} numberOfLines={1}>
                    {ev.title || tCommon("untitledEvent")}
                  </Text>
                  <InlineDivider />
                  <Text style={styles.metaText}>
                    {eventDraftWhenLabel(ev, locale)}
                  </Text>
                </View>
              ))}
              {!receipt && events.length === 0 && (
                <Text style={styles.metaText}>{t("noContent")}</Text>
              )}

              {/* 旅行割当。タップで割当先選択シート（inbox-pick-trip route。他の
                  formSheet と同じネイティブの質感）を開いて選び直せる（値＋
                  シェブロンのドロップダウン相当。「確定」の文言は使わない —
                  ここでは割当先を変えるだけで、実際の確定は各旅行の画面で
                  行うため）。 */}
              <View style={styles.actionsRow}>
                <Pressable
                  onPress={() =>
                    router.push(`/trips/inbox-pick-trip?emailId=${e.id}`)
                  }
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
                    numberOfLines={1}
                  >
                    {assigned
                      ? (tripLabels.get(assigned.id) ?? assigned.title)
                      : t("selectTripPrompt")}
                  </Text>
                  <ChevronIcon
                    size={14}
                    rotate={90}
                    color={
                      assigned ? theme.foreground : theme.warnAccent
                    }
                  />
                </Pressable>
                <Pressable onPress={() => dismiss(e.id)} hitSlop={8}>
                  <Text style={styles.dismissLabel}>{t("dismiss")}</Text>
                </Pressable>
              </View>
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
  addressRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  address: {
    flex: 1,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
    color: t.foreground,
  },
  copyButton: {
    height: 28,
    width: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
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
  emailMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  metaText: { fontSize: 12, color: t.mutedForeground },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  assignButton: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: t.fgAlpha(0.05),
  },
  assignButtonWarn: { backgroundColor: t.warnChipBg },
  assignLabel: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "500",
    color: t.foreground,
  },
  assignLabelWarn: { color: t.warnAccent },
  dismissLabel: { fontSize: 12, color: t.mutedForeground },
  usage: { fontSize: 11, color: t.mutedForeground, marginTop: 8 },
});
