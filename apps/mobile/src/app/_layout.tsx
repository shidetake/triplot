import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { IntlProvider } from "use-intl";

import { deviceLocale, messagesFor } from "@/lib/i18n";
import { AppQueryProvider } from "@/lib/query";
import { SessionProvider } from "@/lib/session";

export default function RootLayout() {
  const locale = deviceLocale();
  // ナビバー/タブバー（React Navigation 描画）の配色を OS のライト/ダークに
  // 追従させる。アプリ本体の色は lib/theme.ts のトークン側で切り替える。
  const navTheme = useColorScheme() === "dark" ? DarkTheme : DefaultTheme;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <IntlProvider
        locale={locale}
        messages={messagesFor(locale)}
        // 表示は端末のタイムゾーンで（web はサーバ描画の都合で明示していないが、
        // アプリは常に端末 TZ が正）。
        timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
      >
        <SessionProvider>
          <AppQueryProvider>
            <BottomSheetModalProvider>
              <ThemeProvider value={navTheme}>
              <Stack>
                <Stack.Screen
                  name="sign-in"
                  options={{ headerShown: false }}
                />
                <Stack.Screen name="(app)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="dev-check"
                  options={{ title: "M0 チェック" }}
                />
              </Stack>
              </ThemeProvider>
            </BottomSheetModalProvider>
          </AppQueryProvider>
        </SessionProvider>
      </IntlProvider>
    </GestureHandlerRootView>
  );
}
