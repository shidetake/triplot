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

import { AppleGlyph, GoogleGlyph } from "@/components/oauth-brand-icons";
import {
  devAutoLogin,
  devSignInAvailable,
  googleSignInAvailable,
  signInWithApple,
  signInWithDevPassword,
  signInWithGoogle,
} from "@/lib/auth";
import { useSession } from "@/lib/session";

export default function SignInScreen() {
  const t = useTranslations("auth");
  const { session, isLoading } = useSession();
  const dark = useColorScheme() === "dark";
  const [busy, setBusy] = useState(false);

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
      <View style={styles.buttons}>
        {/* Apple / Google 共通のニュートラル枠線ボタン＋ロゴだけブランド
            （web の OAuthSignInButton と同じ方針。Strava 等の実例と同様、
            ダークモードは黒地＋白枠。Apple 公式ボタンは白固定になるので使わず、
            ガイドライン準拠のカスタムボタンにして web と見た目を揃える）。
            Apple 先頭。 */}
        <Pressable
          accessibilityRole="button"
          onPress={() => void run(signInWithApple)}
          style={[styles.oauthButton, dark && styles.oauthButtonDark]}
        >
          <AppleGlyph size={18} color={dark ? "#E3E3E3" : "#1f1f1f"} />
          <Text style={[styles.oauthLabel, dark && styles.oauthLabelDark]}>
            {t("signInWithApple")}
          </Text>
        </Pressable>
        {googleSignInAvailable && (
          <Pressable
            accessibilityRole="button"
            onPress={() => void run(signInWithGoogle)}
            style={[styles.oauthButton, dark && styles.oauthButtonDark]}
          >
            <GoogleGlyph size={18} />
            <Text style={[styles.oauthLabel, dark && styles.oauthLabelDark]}>
              {t("signInWithGoogle")}
            </Text>
          </Pressable>
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
  // web の OAuthSignInButton と同じニュートラル配色（白地+#747775枠 /
  // ダーク #131314 地+#8E918F 枠、文字 #E3E3E3）。Apple/Google 共通。
  oauthButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 44,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#747775",
    backgroundColor: "#ffffff",
  },
  oauthButtonDark: {
    backgroundColor: "#131314",
    borderColor: "#8E918F",
  },
  oauthLabel: { fontSize: 15, fontWeight: "500", color: "#1f1f1f" },
  oauthLabelDark: { color: "#E3E3E3" },
  devArea: { alignItems: "center", gap: 16 },
  devButton: { padding: 8 },
  devLink: { color: "#2563eb", fontSize: 12 },
});
