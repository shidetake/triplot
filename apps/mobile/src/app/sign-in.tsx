import { Link, Redirect } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { useTranslations } from "use-intl";

import { OAuthSignInButton } from "@/components/oauth-sign-in-button";
import {
  devAutoLogin,
  devSignInAvailable,
  googleSignInAvailable,
  signInWithApple,
  signInWithDevPassword,
  signInWithGoogle,
} from "@/lib/auth";
import { getLastAuthProvider, type AuthProvider } from "@/lib/lastAuthProvider";
import { useSession } from "@/lib/session";

export default function SignInScreen() {
  const t = useTranslations("auth");
  const { session, isLoading } = useSession();
  const dark = useColorScheme() === "dark";
  const [busy, setBusy] = useState(false);
  // 「前回このプロバイダでサインインしました」バッジ用。1回だけ読んで両ボタンへ
  // props で配る（web の Server Component で cookie を1回読むのと同じ形）。
  const [lastAuthProvider, setLastAuthProvider] = useState<AuthProvider | null>(
    null,
  );
  useEffect(() => {
    void getLastAuthProvider().then(setLastAuthProvider);
  }, []);

  // EXPO_PUBLIC_DEV_AUTO_LOGIN=1 のとき、セッション復元が済んで未ログインなら
  // 開発用ログインを1回だけ自動実行（ヘッドレス検証でタップを省くため）。
  const autoTried = useRef(false);
  useEffect(() => {
    if (!devAutoLogin || autoTried.current || isLoading || session) return;
    autoTried.current = true;
    void signInWithDevPassword().catch((e: unknown) =>
      Alert.alert(String(e)),
    );
  }, [isLoading, session]);

  if (!isLoading && session) {
    return <Redirect href="/" />;
  }

  const run = async (fn: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      // 成功時は SessionProvider の onAuthStateChange → 上の Redirect が発火する。
    } catch (e) {
      Alert.alert(t("signInFailed", { message: String(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, dark && styles.containerDark]}>
      <Text style={[styles.wordmark, dark && styles.textDark]}>triplot</Text>
      {/* Apple 先頭（web の OAuthSignInButton と同じ並び）。 */}
      <View style={styles.buttons}>
        <OAuthSignInButton
          provider="apple"
          onPress={() => void run(signInWithApple)}
          lastUsed={lastAuthProvider === "apple"}
        />
        {googleSignInAvailable && (
          <OAuthSignInButton
            provider="google"
            onPress={() => void run(signInWithGoogle)}
            lastUsed={lastAuthProvider === "google"}
          />
        )}
      </View>
      {__DEV__ && (
        <View style={styles.devArea}>
          {devSignInAvailable && (
            <Pressable
              accessibilityRole="button"
              onPress={() => void run(signInWithDevPassword)}
              style={styles.devButton}
            >
              <Text style={styles.devLink}>開発用ログイン</Text>
            </Pressable>
          )}
          <Link href="/dev-check" style={styles.devLink}>
            M0 チェック画面
          </Link>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 48,
    backgroundColor: "#ffffff",
  },
  containerDark: { backgroundColor: "#0a0a0a" },
  wordmark: { fontSize: 32, fontWeight: "600", letterSpacing: -0.5 },
  textDark: { color: "#fafafa" },
  buttons: { width: 280, gap: 12 },
  devArea: { alignItems: "center", gap: 16 },
  devButton: { padding: 8 },
  devLink: { color: "#2563eb", fontSize: 12 },
});
