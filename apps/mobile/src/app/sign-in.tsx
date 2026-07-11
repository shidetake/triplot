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
import Svg, { Path } from "react-native-svg";
import { useTranslations } from "use-intl";

import {
  devAutoLogin,
  devSignInAvailable,
  googleSignInAvailable,
  signInWithApple,
  signInWithDevPassword,
  signInWithGoogle,
} from "@/lib/auth";
import { useSession } from "@/lib/session";

// Apple ロゴ（単色シルエット。web の oauth-brand-icons.tsx の AppleGlyph と同一
// パス）。ボタン文字色に追従させるため fill は呼び出し側で渡す。
function AppleGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path
        fill={color}
        d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
      />
    </Svg>
  );
}

// Google "G" ロゴ（4色、web の components/oauth-brand-icons.tsx と同じ公式パス）。
// ボタン配色は web の OAuthSignInButton と同じ「全プロバイダ共通のニュートラル枠線
// +ロゴだけブランド」（docs/ui-guidelines.md の OAuth ボタン節）。
function GoogleGlyph({ size }: { size: number }) {
  return (
    <Svg viewBox="0 0 48 48" width={size} height={size}>
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

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
