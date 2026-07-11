import { getLocales } from "expo-localization";

import en from "@triplot/shared/messages/en.json";
import ja from "@triplot/shared/messages/ja.json";

// カタログは packages/shared/messages（web と単一の真実）。
// ロケール判定は web（i18n/locale.ts）と同じ規則: ja* → ja、en* → en、他 → 既定(ja)。
// 端末の言語設定から取る。アプリ内に言語設定は置かない＝iOS の流儀どおり
// 設定アプリ → triplot → 言語 のアプリ単位切替に任せる（app.config.ts の
// CFBundleLocalizations 宣言で有効。getLocales はその選択を反映する）。
export const locales = ["ja", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ja";

export function deviceLocale(): Locale {
  const lang = getLocales()[0]?.languageCode?.toLowerCase() ?? "";
  if (lang.startsWith("ja")) return "ja";
  if (lang.startsWith("en")) return "en";
  return defaultLocale;
}

const MESSAGES = { ja, en } as const;

export function messagesFor(locale: Locale) {
  return MESSAGES[locale];
}
