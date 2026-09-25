import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslations } from "use-intl";

import {
  classifyLinkError,
  LOGIN_PROVIDERS,
  type LoginProvider,
  linkedProviders,
} from "@triplot/shared/loginMethods";

import { CheckIcon, PlusIcon } from "@/components/icons";
import { AppleGlyph, GoogleGlyph } from "@/components/oauth-brand-icons";
import { toast } from "@/components/toast";
import { googleSignInAvailable, linkLoginMethod } from "@/lib/auth";
import { LIST_ROW_PADDING_H } from "@/lib/layout";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { type Theme, useTheme, useThemedStyles } from "@/lib/theme";

// 設定の「ログイン方法」。今のアカウントに Google / Apple を足す
// （web の LoginMethods と同じ役割・同じ並び）。
//
// 足すだけで、アカウントの統合はしない。その Google / Apple で既に別の
// アカウントがあると Supabase が断るので、案内を出す。
//
// web はリダイレクトで追加して戻った先でトーストを出すが、iOS はシートの中で
// 本人確認が完結するので、その場で出す（失敗の案内は他の設定の失敗と同じく
// Alert。長い文を読ませるので、消えるトーストより向いている）。
//
// ゲストには出さない（ゲストの本登録は引換券方式。lib/auth.ts の upgradeGuest）。
const PROVIDER_NAME: Record<LoginProvider, string> = {
  google: "Google",
  apple: "Apple",
};

export function LoginMethods() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const t = useTranslations("settings");
  const [busy, setBusy] = useState(false);
  const { session } = useSession();
  const isGuest = session?.user.is_anonymous ?? false;

  // 付いているログイン方法はサーバの最新を読む（セッションに入っている分は
  // 追加の直後に古いことがある）。
  const { data: linked, refetch } = useQuery({
    queryKey: ["loginMethods", session?.user.id],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return linkedProviders(user?.identities);
    },
    enabled: !!session && !isGuest,
  });

  // 読み込み中とゲストは出さない。
  if (isGuest || !linked) return null;

  // Google Sign-In の設定が無いビルドでは、ログイン画面と同じく Google を出さない。
  const providers = LOGIN_PROVIDERS.filter(
    (p) => p !== "google" || googleSignInAvailable,
  );

  const add = (provider: LoginProvider) => {
    void (async () => {
      const name = PROVIDER_NAME[provider];
      setBusy(true);
      try {
        if (await linkLoginMethod(provider)) {
          await refetch();
          toast(t("loginMethodLinkedToast", { provider: name }));
        }
      } catch (e) {
        const reason = classifyLinkError(
          e as { code?: string; message?: string },
        );
        Alert.alert(
          reason === "already_used"
            ? t("loginMethodAlreadyUsed", { provider: name })
            : t("loginMethodLinkFailed", {
                provider: name,
                message: String((e as { message?: string }).message ?? e),
              }),
        );
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <View>
      <Text style={styles.label}>{t("loginMethods")}</Text>
      <View style={styles.list}>
        {providers.map((provider) => {
          const name = PROVIDER_NAME[provider];
          const isLinked = linked.has(provider);
          return (
            <View key={provider} style={styles.row}>
              {provider === "google" ? (
                <GoogleGlyph size={16} />
              ) : (
                <AppleGlyph size={16} color={theme.foreground} />
              )}
              <Text style={styles.rowLabel}>{name}</Text>
              {isLinked ? (
                <View
                  style={styles.action}
                  accessible
                  accessibilityLabel={t("loginMethodLinked", { provider: name })}
                >
                  <CheckIcon size={18} color={theme.mutedForeground} />
                </View>
              ) : (
                <Pressable
                  onPress={() => add(provider)}
                  disabled={busy}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t("loginMethodAdd", { provider: name })}
                  style={[styles.action, busy && styles.disabled]}
                >
                  <PlusIcon size={18} color={theme.foreground} />
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
      <Text style={styles.hint}>{t("loginMethodsHelp")}</Text>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    label: {
      fontSize: 14,
      fontWeight: "500",
      marginBottom: 4,
      color: t.foreground,
    },
    // 設定シートの navList と同じ形（区切り線を器の端まで引く。lib/layout.ts）。
    list: {
      marginHorizontal: -LIST_ROW_PADDING_H,
      paddingHorizontal: LIST_ROW_PADDING_H,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.fgAlpha(0.08),
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 44,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.fgAlpha(0.08),
    },
    rowLabel: { flex: 1, fontSize: 14, color: t.foreground },
    action: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    disabled: { opacity: 0.5 },
    hint: { fontSize: 12, color: t.mutedForeground, marginTop: 6 },
  });
