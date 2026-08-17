import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslations } from "use-intl";

import { joinTripViaInvite, peekInvite } from "@triplot/shared/data/invites";

import { OAuthSignInButton } from "@/components/oauth-sign-in-button";
import {
  googleSignInAvailable,
  signInWithApple,
  signInWithGoogle,
} from "@/lib/auth";
import { getLastAuthProvider, type AuthProvider } from "@/lib/lastAuthProvider";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";

// 招待リンクからの参加（web の /join/[token] と同じ役割）。認証ゲートの
// (app) グループの外に置く＝未ログインでも旅行名を見て、その場でサインイン
// またはゲスト参加できる。
//
// この画面に来る経路は2つ:
//  - Universal Link: https://triplot.app/join/<token>（app.config.ts の
//    associatedDomains ＋ web が配信する apple-app-site-association）
//  - カスタムスキーム: triplot://join/<token>（開発・シミュレータでの確認用）
// アプリ未インストールの端末では従来どおり web の参加ページが開く。
export default function JoinScreen() {
  const { token: rawToken } = useLocalSearchParams<{ token: string }>();
  const token = decodeURIComponent(rawToken ?? "");
  const t = useTranslations("join");
  const tErr = useTranslations("errors");
  const tCommon = useTranslations("common");
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { session, isLoading: sessionLoading } = useSession();
  const [lastAuthProvider, setLastAuthProvider] = useState<AuthProvider | null>(
    null,
  );
  useEffect(() => {
    void getLastAuthProvider().then(setLastAuthProvider);
  }, []);

  // 旅行名の先読み（anon 可）。トークンが無効なら null。
  const { data: title, isLoading } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => peekInvite(supabase, token),
    enabled: !!token,
  });

  // 表示名の初期値。web と同じく full_name → name の順で拾う（Google は両方
  // 入るが Apple は full_name のみ）。匿名セッションは何も持たないので空。
  const meta = session?.user.user_metadata as
    | { full_name?: string; name?: string }
    | undefined;
  const defaultName = session?.user.is_anonymous
    ? ""
    : (meta?.full_name ?? meta?.name ?? "");
  const [name, setName] = useState<string | null>(null);
  const vName = name ?? defaultName;
  const [busy, setBusy] = useState(false);

  const join = async () => {
    setBusy(true);
    const r = await joinTripViaInvite(supabase, token, vName.trim());
    setBusy(false);
    if (!r.ok) {
      // shared のエラーは "errors.xxx" のキー。翻訳できないものはそのまま出す。
      Alert.alert(
        r.error.startsWith("errors.") ? tErr(r.error.slice(7)) : r.error,
      );
      return;
    }
    // 参加後は旅行詳細へ。この画面には戻らせない（リンクは使い終わっている）。
    router.replace(`/trips/${r.data.tripId}`);
  };

  // 未ログインからのゲスト参加（匿名サインイン → 参加）。web の joinAsGuest と同じ。
  const joinAsGuest = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      setBusy(false);
      Alert.alert(t("guestDisabled"));
      return;
    }
    setBusy(false);
    await join();
  };

  // サインインが成功するとセッションが入り、下の「参加」ボタンに切り替わる
  // （web が /join/<token> に戻ってくるのと同じ状態遷移）。
  const runSignIn = async (fn: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || sessionLoading) return <View style={styles.screen} />;

  if (!title) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.invalidTitle}>{t("invalidTitle")}</Text>
        <Text style={styles.description}>{t("invalidBody")}</Text>
        <Pressable
          onPress={() => router.replace("/trips")}
          style={styles.outlineButton}
        >
          <Text style={styles.outlineLabel}>{t("toTop")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.invitedTo}>{t("invitedTo")}</Text>
      <Text style={styles.tripTitle}>{title}</Text>
      <Text style={styles.description}>{t("enterName")}</Text>

      {/* 表示名はラベルを残す例外（「この旅行内での名前」の説明が要る＋
          placeholder が実質のデフォルト値。docs/ui-guidelines.md）。 */}
      <View style={styles.field}>
        <Text style={styles.label}>{t("displayNameLabel")}</Text>
        <TextInput
          value={vName}
          onChangeText={setName}
          placeholder={t("guestPlaceholder")}
          placeholderTextColor={theme.subtleForeground}
          accessibilityLabel={t("displayNameLabel")}
          maxLength={32}
          style={styles.input}
        />
      </View>

      {session ? (
        <Pressable
          onPress={() => void join()}
          disabled={busy}
          style={[styles.primaryButton, busy && styles.disabled]}
        >
          <Text style={styles.primaryLabel}>
            {busy ? t("joining") : t("joinTrip")}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.signInBlock}>
          <Pressable
            onPress={() => void joinAsGuest()}
            disabled={busy}
            style={[styles.primaryButton, busy && styles.disabled]}
          >
            <Text style={styles.primaryLabel}>
              {busy ? t("joining") : t("joinAsGuest")}
            </Text>
          </Pressable>

          <View style={styles.separatorRow}>
            <View style={styles.separatorLine} />
            <Text style={styles.separatorLabel}>{tCommon("or")}</Text>
            <View style={styles.separatorLine} />
          </View>

          {/* サインイン画面と同じ共通部品（web と同じニュートラル配色＋
              「前回使用」バッジ）。 */}
          <OAuthSignInButton
            provider="apple"
            onPress={() => void runSignIn(signInWithApple)}
            lastUsed={lastAuthProvider === "apple"}
          />
          {googleSignInAvailable && (
            <OAuthSignInButton
              provider="google"
              onPress={() => void runSignIn(signInWithGoogle)}
              lastUsed={lastAuthProvider === "google"}
            />
          )}
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.background },
    content: { padding: 24, gap: 12 },
    centered: { alignItems: "flex-start", justifyContent: "center", padding: 24, gap: 12 },
    invitedTo: { fontSize: 14, color: t.mutedForeground },
    tripTitle: { fontSize: 24, fontWeight: "600", color: t.foreground },
    invalidTitle: { fontSize: 24, fontWeight: "600", color: t.foreground },
    description: { fontSize: 14, color: t.mutedForeground },
    field: { marginTop: 12, gap: 4 },
    label: { fontSize: 14, fontWeight: "500", color: t.foreground },
    input: {
      height: 36,
      borderWidth: 1,
      borderColor: t.fgAlpha(0.2),
      borderRadius: 6,
      paddingHorizontal: 10,
      fontSize: 14,
      color: t.foreground,
    },
    primaryButton: {
      height: 44,
      borderRadius: 6,
      backgroundColor: t.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryLabel: { fontSize: 15, fontWeight: "500", color: t.primaryForeground },
    disabled: { opacity: 0.5 },
    signInBlock: { gap: 12 },
    separatorRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    separatorLine: { flex: 1, height: 1, backgroundColor: t.fgAlpha(0.1) },
    separatorLabel: { fontSize: 12, color: t.subtleForeground },
    outlineButton: {
      height: 40,
      paddingHorizontal: 16,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: t.fgAlpha(0.2),
      alignItems: "center",
      justifyContent: "center",
    },
    outlineLabel: { fontSize: 14, fontWeight: "500", color: t.foreground },
  });
