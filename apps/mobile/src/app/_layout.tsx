import { Stack } from "expo-router";
import { IntlProvider } from "use-intl";

import { deviceLocale, messagesFor } from "@/lib/i18n";

export default function RootLayout() {
  const locale = deviceLocale();
  return (
    <IntlProvider
      locale={locale}
      messages={messagesFor(locale)}
      // 表示は端末のタイムゾーンで（web はサーバ描画の都合で明示していないが、
      // アプリは常に端末 TZ が正）。
      timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
    >
      <Stack />
    </IntlProvider>
  );
}
