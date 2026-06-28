// クライアント・サーバー両方から import 可能な定数と型のみ。
// next/headers を使う resolveTheme は theme.server.ts に分離している。

export const themes = ["system", "light", "dark"] as const;
export type Theme = (typeof themes)[number];
export const THEME_COOKIE = "NEXT_THEME";

export function isTheme(v: string | undefined | null): v is Theme {
  return v != null && (themes as readonly string[]).includes(v);
}
