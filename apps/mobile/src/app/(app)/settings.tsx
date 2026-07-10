import { useQuery } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslations } from "use-intl";

import { updateDisplayName } from "@triplot/shared/data/account";
import { fetchUserProfile } from "@triplot/shared/data/reads/trips";

import { signOut } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";

// 設定（モーダル）。デフォルト表示名の変更とサインアウト。
// テーマは RN では OS 追従（設定不要）、言語切替は端末設定準拠（M7 では固定）。
export default function SettingsScreen() {
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
    router.back();
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{ title: t("settings.heading"), presentation: "modal" }}
      />

      <Text style={styles.email}>{session?.user.email}</Text>

      <View>
        <Text style={styles.label}>{t("createTrip.displayName")}</Text>
        <TextInput
          value={vName}
          onChangeText={setName}
          placeholder={t("settings.namePlaceholder")}
          placeholderTextColor="rgba(0,0,0,0.38)"
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
          void signOut().then(() => router.dismissAll());
        }}
        style={styles.signOutButton}
      >
        <Text style={styles.signOutLabel}>{t("account.signOut")}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  email: { fontSize: 13, color: "rgba(0,0,0,0.6)" },
  label: { fontSize: 13, fontWeight: "500", marginBottom: 4 },
  hint: { fontSize: 12, color: "rgba(0,0,0,0.55)", marginTop: 6 },
  input: {
    height: 36,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.2)",
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  submitButton: {
    height: 44,
    borderRadius: 6,
    backgroundColor: "#09090b",
    alignItems: "center",
    justifyContent: "center",
  },
  submitLabel: { color: "#fff", fontSize: 15, fontWeight: "500" },
  disabled: { opacity: 0.5 },
  signOutButton: {
    height: 40,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  signOutLabel: { fontSize: 13, fontWeight: "500", color: "rgba(0,0,0,0.7)" },
});
