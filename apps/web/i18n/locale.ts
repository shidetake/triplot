import { cookies, headers } from "next/headers";

// 対応ロケール。既定は日本語。URL 接頭辞は使わず Cookie + Accept-Language で判定。
export const locales = ["ja", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ja";

export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: string | undefined | null): value is Locale {
  return value != null && (locales as readonly string[]).includes(value);
}

// リクエストからロケールを解決する。Cookie 優先 → Accept-Language → 既定(ja)。
export async function resolveLocale(): Promise<Locale> {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  // Accept-Language の先頭言語タグだけ素朴に見る（ja* → ja、en* → en、他 → 既定）。
  const accept = ((await headers()).get("accept-language") ?? "").toLowerCase();
  const primary = accept.split(",")[0]?.trim() ?? "";
  if (primary.startsWith("ja")) return "ja";
  if (primary.startsWith("en")) return "en";
  return defaultLocale;
}
