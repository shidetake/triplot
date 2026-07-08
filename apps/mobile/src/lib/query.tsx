import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";

// TanStack Query の共通設定。mutation 成功時の invalidateQueries が
// web の router.refresh() 相当（サーバから再取得して全タブに反映）。
// フォアグラウンド復帰でも refetch する（RN には window focus が無いので
// AppState を focusManager に接続する公式パターン）。
export function AppQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 画面遷移のたびに叩き直さない程度の鮮度。手動更新は
            // RefreshControl とフォアグラウンド復帰で担保する。
            staleTime: 30 * 1000,
            retry: 1,
          },
        },
      }),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      focusManager.setFocused(state === "active");
    });
    return () => sub.remove();
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
