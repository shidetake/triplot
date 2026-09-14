import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";

import { DISPLAY_NAME_MAX } from "@triplot/shared/displayName";
import {
  findJoinedTripByInvite,
  joinTripViaInvite,
  peekInvite,
} from "@triplot/shared/data/invites";
import { fetchUserProfile } from "@triplot/shared/data/reads/trips";

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
import { replaceOnce } from "@/lib/navigate";

// 招待リンクからの参加（web の /join/[token] と同じ役割）。認証ゲートの
// (app) グループの外に置く＝未ログインでも旅行名を見て、その場でサインイン
// またはゲスト参加できる。
//
// この画面に来る経路は2つ:
//  - Universal Link: https://triplot.app/join/<token>（app.config.ts の
//    associatedDomains ＋ web が配信する apple-app-site-association）
//  - カスタムスキーム: triplot://join/<token>（開発・シミュレータでの確認用。
//    preview ビルドは triplot-staging://join/<token> で、共有ボタンもそちらの
//    リンクを出す —— triplot.app は本番の DB を読むので、staging で作った
//    トークンは開けない。src/lib/shareTripInvite.ts 参照）
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
  // この画面はナビヘッダーを出さない（ルート直下・認証ゲートの外）ので、
  // 中身が status bar とダイナミックアイランドの下に潜る。上端の余白は
  // 自分で持つ（ヘッダーを出す画面は OS がやってくれるぶん）。
  const insets = useSafeAreaInsets();
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

  // **もう入っている旅行なら、参加画面は出さずにその旅行へ送る。**
  // 自分が共有したリンクを自分で踏む・同じリンクを2回踏む、はどちらも普通に
  // 起きる。判定は RLS に任せる（findJoinedTripByInvite のコメント参照）。
  const { data: joinedTripId, isLoading: joinedLoading } = useQuery({
    queryKey: ["invite-joined", token, session?.user.id],
    queryFn: () => findJoinedTripByInvite(supabase, token),
    enabled: !!token && !!session,
  });
  useEffect(() => {
    if (joinedTripId) replaceOnce(`/trips/${joinedTripId}`);
  }, [joinedTripId]);

  // 表示名の初期値は**アカウントの既定表示名**（users.display_name）。設定画面が
  // 「旅行に参加するときのデフォルト表示名」と説明しているのはこの値で、旅行作成
  // シートの初期値とも揃う（web の参加ページと同じ順序）。
  const signedIn = !!session && !session.user.is_anonymous;
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile", session?.user.id],
    queryFn: () => fetchUserProfile(supabase, session!.user.id),
    enabled: signedIn,
  });
  // 既定表示名が空の時だけ、サインインの情報から full_name → name の順で拾う
  // （Google は両方入るが Apple は full_name のみ）。匿名セッションは何も持たない。
  const meta = session?.user.user_metadata as
    { full_name?: string; name?: string } | undefined;
  const defaultName = signedIn
    ? profile?.display_name?.trim() || (meta?.full_name ?? meta?.name ?? "")
    : "";
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
    replaceOnce(`/trips/${r.data.tripId}`);
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

  // 既定表示名が届く前に描くと、入力欄の名前が後から書き換わる。送り先が
  // 決まるまでも出さない（参加画面が一瞬見えてから飛ぶのを避ける）。
  if (
    isLoading ||
    sessionLoading ||
    (signedIn && profileLoading) ||
    joinedLoading ||
    joinedTripId
  ) {
    return <View style={styles.screen} />;
  }

  if (!title) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.invalidTitle}>{t("invalidTitle")}</Text>
        <Text style={styles.description}>{t("invalidBody")}</Text>
        <Pressable
          onPress={() => replaceOnce("/trips")}
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
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}
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
          maxLength={DISPLAY_NAME_MAX}
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
    primaryLabel: { fontSize: 14, fontWeight: "500", color: t.primaryForeground },
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
