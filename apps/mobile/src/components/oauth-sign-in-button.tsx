import { Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import { useTranslations } from "use-intl";

import type { AuthProvider } from "@/lib/lastAuthProvider";
import { useTheme } from "@/lib/theme";

import { AppleGlyph, GoogleGlyph } from "./oauth-brand-icons";

// Apple / Google 共通のニュートラル枠線ボタン（web の components/oauth-sign-in-button.tsx
// と同じ配色・同じ方針）。サインイン画面と招待参加画面の両方が使う単一の部品
// （以前はこの2画面にほぼ同じ実装が重複していた）。
//
// lastUsed は「前回この端末でこのプロバイダを使ってサインインしたか」（web の
// OAuthSignInButton の lastUsed と対）。読み取りは呼び出し側が1回だけ行い props
// で渡す（AsyncStorage を各ボタンで読まない）。
export function OAuthSignInButton({
  provider,
  onPress,
  lastUsed = false,
}: {
  provider: AuthProvider;
  onPress: () => void;
  lastUsed?: boolean;
}) {
  const t = useTranslations("auth");
  const theme = useTheme();
  const dark = useColorScheme() === "dark";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.button, dark && styles.buttonDark]}
    >
      {provider === "google" ? (
        <GoogleGlyph size={18} />
      ) : (
        <AppleGlyph size={18} color={dark ? "#E3E3E3" : "#1f1f1f"} />
      )}
      <Text style={[styles.label, dark && styles.labelDark]}>
        {provider === "google" ? t("signInWithGoogle") : t("signInWithApple")}
      </Text>
      {lastUsed && (
        <View
          style={[styles.badge, { backgroundColor: theme.primary }]}
          pointerEvents="none"
        >
          <Text style={[styles.badgeText, { color: theme.primaryForeground }]}>
            {t("lastUsed")}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // web の OAuthSignInButton と同じニュートラル配色（白地+#747775枠 /
  // ダーク #131314 地+#8E918F 枠、文字 #E3E3E3）。Apple/Google 共通。
  button: {
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
  buttonDark: { backgroundColor: "#131314", borderColor: "#8E918F" },
  label: { fontSize: 14, fontWeight: "500", color: "#1f1f1f" },
  labelDark: { color: "#E3E3E3" },
  // ボタン上端にまたがる小さなピル（web の absolute -top-2 right-3 と同形）。
  badge: {
    position: "absolute",
    top: -8,
    right: 12,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 10, fontWeight: "500" },
});
