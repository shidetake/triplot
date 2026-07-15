import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslations } from "use-intl";

import { updateDisplayName } from "@triplot/shared/data/account";
import { fetchUserProfile } from "@triplot/shared/data/reads/trips";

import { SheetTitle } from "@/components/sheet-title";
import { signOut } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";
import { useSession } from "@/lib/session";

// 設定（FormSheet の中身）。デフォルト表示名の変更とサインアウト。
// テーマは RN では OS 追従（設定不要）、言語切替は端末設定準拠（M7 では固定）。
export function SettingsSheet({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = useTranslations();
  const { session } = useSession();
  const userId = session?.user.id;

  const { data: profile, refetch } = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => fetchUserProfile(supabase, userId!),
    enabled: !!userId,
  });

  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const vName = name ?? profile?.display_name ?? "";

  const save = async () => {
    setBusy(true);
    const r = await updateDisplayName(supabase, userId!, vName);
    setBusy(false);
    if (!r.ok) return;
    void refetch();
    onDone();
  };

  return (
    <View style={styles.content}>
      <SheetTitle>{t("settings.heading")}</SheetTitle>

      <Text style={styles.email}>{session?.user.email}</Text>

      <View>
        {/* ラベル無し＋placeholder＝フィールド名（表示名）。説明は下のヒントが担う。 */}
        <TextInput
          value={vName}
          onChangeText={setName}
          placeholder={t("settings.namePlaceholder")}
          accessibilityLabel={t("settings.namePlaceholder")}
          placeholderTextColor={theme.subtleForeground}
          style={styles.input}
        />
        <Text style={styles.hint}>{t("settings.displayNameHelp")}</Text>
      </View>

      <Pressable
        onPress={() => void save()}
        disabled={busy}
        style={[styles.submitButton, busy && styles.disabled]}
      >
        <Text style={styles.submitLabel}>{busy ? "保存中..." : "保存"}</Text>
      </Pressable>

      <Pressable
        onPress={() => {
          onDone();
          void signOut();
        }}
        style={styles.signOutButton}
      >
        <Text style={styles.signOutLabel}>{t("account.signOut")}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  content: { paddingHorizontal: 16, gap: 16 },
  email: { fontSize: 13, color: t.mutedForeground },
  label: { fontSize: 13, fontWeight: "500", marginBottom: 4, color: t.foreground },
  hint: { fontSize: 12, color: t.mutedForeground, marginTop: 6 },
  input: {
    height: 36,
    borderWidth: 1,
    borderColor: t.fgAlpha(0.2),
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 14,
    color: t.foreground,
  },
  submitButton: {
    height: 44,
    borderRadius: 6,
    backgroundColor: t.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  submitLabel: { color: t.primaryForeground, fontSize: 15, fontWeight: "500" },
  disabled: { opacity: 0.5 },
  signOutButton: {
    height: 40,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: t.fgAlpha(0.2),
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  signOutLabel: { fontSize: 13, fontWeight: "500", color: t.mutedForeground },
});
