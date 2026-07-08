import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { IntlProvider } from "use-intl";

import { deviceLocale, messagesFor } from "@/lib/i18n";
import { AppQueryProvider } from "@/lib/query";
import { SessionProvider } from "@/lib/session";

export default function RootLayout() {
  const locale = deviceLocale();
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
            <Stack>
              <Stack.Screen name="sign-in" options={{ headerShown: false }} />
              <Stack.Screen name="(app)" options={{ headerShown: false }} />
              <Stack.Screen
                name="dev-check"
                options={{ title: "M0 チェック" }}
              />
            </Stack>
          </AppQueryProvider>
        </SessionProvider>
      </IntlProvider>
    </GestureHandlerRootView>
  );
}
