import { cookies } from "next/headers";

export const themes = ["system", "light", "dark"] as const;
export type Theme = (typeof themes)[number];
export const THEME_COOKIE = "NEXT_THEME";

export function isTheme(v: string | undefined | null): v is Theme {
  return v != null && (themes as readonly string[]).includes(v);
}

/** Cookie からテーマを解決する。未設定は "system"。 */
export async function resolveTheme(): Promise<Theme> {
  const fromCookie = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(fromCookie) ? fromCookie : "system";
}
