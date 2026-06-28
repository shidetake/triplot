"use client";
import { useLayoutEffect } from "react";

import { THEME_COOKIE } from "@/i18n/theme";

/**
 * React ハイドレーションが <html class> を書き戻すケースの即時修正。
 * useLayoutEffect はブラウザのペイント前に同期実行されるのでフラッシュなし。
 * インラインスクリプトが初期表示を担い、これは hydration 後の上書きを防ぐ二重安全。
 */
export function ThemeSync() {
  useLayoutEffect(() => {
    const t =
      document.cookie.match(new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=([^;]+)`))?.[1] ?? "system";
    const el = document.documentElement;
    if (t === "dark") {
      el.classList.add("dark");
    } else if (t === "light") {
      el.classList.remove("dark");
    } else {
      el.classList.toggle("dark", window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
  }, []);
  return null;
}
