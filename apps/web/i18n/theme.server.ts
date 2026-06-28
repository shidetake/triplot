import { cookies } from "next/headers";

import { isTheme, THEME_COOKIE, type Theme } from "./theme";

/** Cookie からテーマを解決する（Server Component / route handler 専用）。未設定は "system"。 */
export async function resolveTheme(): Promise<Theme> {
  const fromCookie = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(fromCookie) ? fromCookie : "system";
}
