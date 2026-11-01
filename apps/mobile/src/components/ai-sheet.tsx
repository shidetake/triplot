import * as Application from "expo-application";
import * as Clipboard from "expo-clipboard";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useFormatter, useTranslations } from "use-intl";

import { AI_GUIDES, aiClientName } from "@triplot/shared/aiClients";

import { ChevronIcon, CopyIcon } from "@/components/icons";
import { InlineDivider } from "@/components/inline-divider";
import { SheetTitle } from "@/components/sheet-title";
import { toast } from "@/components/toast";
import { LIST_ROW_PADDING_H } from "@/lib/layout";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";

// AI 連携（MCP）の案内と、連携している AI の一覧と解除。web の /ai
// （apps/web/app/ai/page.tsx）と同じ中身・同じ文言（ai の翻訳）。
// 設計: docs/design/mcp.md

// AI に貼ってもらう接続先。本番は web の入口。preview ビルド（staging）は、
// staging の web が Vercel の保護の内側で外の AI から届かないので、Supabase の
// 中継（Edge Function の mcp）を案内する（web の MCP_RESOURCE_URL と同じもの）。
function mcpUrl(): string {
  const staging = Application.applicationId?.endsWith(".staging") ?? false;
  return staging
    ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/mcp`
    : "https://triplot.app/api/mcp";
}

type Grant = {
  clientId: string;
  name: string;
  grantedAt: string;
  lastUsedAt: string | null;
};

export function AiSheet() {
  const t = useTranslations("ai");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const url = mcpUrl();
  const [open, setOpen] = useState<string | null>(null);
  const { data: grants, refetch } = useQuery({
    queryKey: ["ai-grants"],
    queryFn: async (): Promise<Grant[]> => {
      const [{ data, error }, { data: usage }] = await Promise.all([
        supabase.auth.oauth.listGrants(),
        supabase.from("ai_client_usage").select("client_id, last_used_at"),
      ]);
      if (error) throw error;
      const lastUsed = new Map(
        (usage ?? []).map((u) => [u.client_id, u.last_used_at]),
      );
      return (data ?? []).map((g) => ({
        clientId: g.client.id,
        name: aiClientName(g.client.name) ?? g.client.id,
        grantedAt: g.granted_at,
        lastUsedAt: lastUsed.get(g.client.id) ?? null,
      }));
    },
  });

  const formatDate = (iso: string) =>
    format.dateTime(new Date(iso), {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });

  const copyText = async (text: string) => {
    await Clipboard.setStringAsync(text);
    toast(tCommon("copied"));
  };
  const copy = () => copyText(url);

  // 外すのは確認を挟む（つなぎ直すのは AI の設定まで行く手間があるので）。
  const disconnect = (g: Grant) => {
    Alert.alert(
      t("disconnectConfirmTitle", { name: g.name }),
      t("disconnectConfirmBody"),
      [
        { text: tCommon("cancel"), style: "cancel" },
        {
          text: t("disconnectConfirm"),
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.auth.oauth.revokeGrant({
              clientId: g.clientId,
            });
            toast(error ? t("disconnectFailed") : t("disconnected"));
            void refetch();
          },
        },
      ],
    );
  };

  return (
    <View style={styles.content}>
      <SheetTitle>{t("title")}</SheetTitle>
      <Text style={styles.lead}>{t("lead")}</Text>

      <View style={styles.urlBox}>
        <Text style={styles.urlLabel}>{t("urlLabel")}</Text>
        <View style={styles.urlRow}>
          <Text style={styles.url} selectable numberOfLines={1}>
            {url}
          </Text>
          <Pressable
            onPress={() => void copy()}
            style={styles.copyButton}
            accessibilityLabel={t("copyUrl")}
            hitSlop={8}
          >
            <CopyIcon size={16} color={theme.mutedForeground} />
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>{t("howTo")}</Text>
        <Text style={styles.muted}>{t("howToLead")}</Text>
        <View style={styles.list}>
          {AI_GUIDES.map((ai) => {
            const expanded = open === ai.key;
            return (
              <View key={ai.key} style={styles.row}>
                <Pressable
                  onPress={() => setOpen(expanded ? null : ai.key)}
                  style={styles.rowHead}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                >
                  <Text style={styles.rowLabel}>{ai.name}</Text>
                  <View style={expanded && styles.chevronOpen}>
                    <ChevronIcon size={16} color={theme.mutedForeground} />
                  </View>
                </Pressable>
                {expanded && (
                  <View style={styles.rowBody}>
                    {(t.raw(`${ai.key}Steps`) as string[]).map((s, i) => (
                      <View key={s} style={styles.step}>
                        <Text style={styles.stepNo}>{i + 1}.</Text>
                        {/* 設定の画面を開ける AI は、1つ目の手順をその画面へのリンクにする。 */}
                        {i === 0 && ai.chat ? (
                          <Text
                            style={[styles.stepText, styles.linkStep]}
                            onPress={() => {
                              // 開く前にコピーする（アプリが開くと依頼文は入らないので、貼って送る）。
                              const prompt = t("musePrompt", { url });
                              void Clipboard.setStringAsync(prompt).then(() =>
                                Linking.openURL(ai.chat!(prompt)),
                              );
                            }}
                            accessibilityRole="link"
                          >
                            {s}
                          </Text>
                        ) : i === 0 && ai.setup ? (
                          <Text
                            style={[styles.stepText, styles.linkStep]}
                            onPress={() => {
                              // 入力済みで開けない AI は、開いた先で貼れるよう接続先をコピーしておく。
                              // web 版で開く AI は x-safari-https: で Safari に開かせる（https: のままだと
                              // アプリが入っていればアプリが開く。iOS 17 から。Apple の説明は無いが広く
                              // 使われている書き方で、効かなくなってもアプリが開くだけ）。
                              const href = ai.setup!(url);
                              const open = () =>
                                Linking.openURL(
                                  ai.setupInBrowser ? href.replace(/^https:/, "x-safari-https:") : href,
                                );
                              void (ai.copiesUrl ? Clipboard.setStringAsync(url).then(open) : open());
                            }}
                            accessibilityRole="link"
                          >
                            {s}
                          </Text>
                        ) : (
                          <Text style={styles.stepText}>{s}</Text>
                        )}
                      </View>
                    ))}
                    {ai.help && (
                      <Pressable onPress={() => void Linking.openURL(ai.help!)} hitSlop={8}>
                        <Text style={styles.link}>{t("officialHelp")}</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>{t("examplesTitle")}</Text>
        {(t.raw("examples") as string[]).map((e) => (
          <View key={e} style={styles.step}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.stepText}>{e}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>{t("connectedTitle")}</Text>
        {grants && grants.length === 0 && (
          <Text style={styles.muted}>{t("connectedEmpty")}</Text>
        )}
        {grants && grants.length > 0 && (
          <View style={styles.list}>
            {grants.map((g) => (
              <View key={g.clientId} style={[styles.row, styles.grantRow]}>
                <View style={styles.grantText}>
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {g.name}
                  </Text>
                  <View style={styles.grantMeta}>
                    <Text style={styles.note}>
                      {t("connectedSince", { date: formatDate(g.grantedAt) })}
                    </Text>
                    <InlineDivider />
                    <Text style={styles.note}>
                      {g.lastUsedAt
                        ? t("lastUsed", { date: formatDate(g.lastUsedAt) })
                        : t("notUsedYet")}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => disconnect(g)}
                  style={styles.disconnect}
                  hitSlop={6}
                >
                  <Text style={styles.disconnectLabel}>{t("disconnect")}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>{t("noteTitle")}</Text>
        {(t.raw("notes") as string[]).map((n) => (
          <View key={n} style={styles.step}>
            <Text style={styles.bullet}>•</Text>
            <Text style={[styles.stepText, styles.mutedText]}>{n}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    content: { paddingHorizontal: 16, paddingBottom: 32, gap: 16 },
    lead: { fontSize: 14, lineHeight: 21, color: t.mutedForeground },
    urlBox: {
      borderWidth: 1,
      borderColor: t.fgAlpha(0.1),
      borderRadius: 6,
      padding: 12,
      gap: 6,
    },
    urlLabel: { fontSize: 12, color: t.mutedForeground },
    urlRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    url: { flex: 1, fontSize: 14, color: t.foreground },
    copyButton: {
      height: 28,
      width: 28,
      borderRadius: 6,
      alignItems: "center",
      justifyContent: "center",
    },
    section: { gap: 8, marginTop: 8 },
    heading: { fontSize: 18, fontWeight: "600", color: t.foreground },
    muted: { fontSize: 14, lineHeight: 21, color: t.mutedForeground },
    mutedText: { color: t.mutedForeground },
    // 一覧は1つの枠＋区切り線（ui-guidelines「行にするかカードにするか」）。
    list: {
      borderWidth: 1,
      borderColor: t.fgAlpha(0.1),
      borderRadius: 8,
    },
    row: {
      paddingHorizontal: LIST_ROW_PADDING_H,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.fgAlpha(0.1),
    },
    rowHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
    },
    rowLabel: { fontSize: 14, fontWeight: "500", color: t.foreground },
    chevronOpen: { transform: [{ rotate: "90deg" }] },
    rowBody: { gap: 6, paddingBottom: 12 },
    step: { flexDirection: "row", gap: 6 },
    stepNo: { fontSize: 14, lineHeight: 21, color: t.foreground, minWidth: 16 },
    bullet: { fontSize: 14, lineHeight: 21, color: t.foreground },
    stepText: { flex: 1, fontSize: 14, lineHeight: 21, color: t.foreground },
    note: { fontSize: 12, color: t.mutedForeground },
    link: { fontSize: 12, color: t.linkText },
    linkStep: { color: t.linkText },
    grantRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
    },
    grantText: { flex: 1, minWidth: 0, gap: 2 },
    grantMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8 },
    disconnect: {
      height: 32,
      paddingHorizontal: 12,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: t.fgAlpha(0.2),
      alignItems: "center",
      justifyContent: "center",
    },
    disconnectLabel: { fontSize: 12, color: t.foreground },
  });
