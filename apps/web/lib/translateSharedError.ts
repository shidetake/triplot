import type { getTranslations } from "next-intl/server";

type TErrors = Awaited<ReturnType<typeof getTranslations<"errors">>>;

const ERROR_KEYS = new Set([
  "createFailed",
  "copyFailed",
  "tripCopySourceNotFound",
  "notAdmin",
  "unknownIcon",
  "iconAlreadyAdded",
  "notTripMember",
  "joinFailed",
  "issueFailed",
  "regenerateFailed",
]);

// Translates a shared-data error code (e.g. "errors.notAdmin") to the current locale.
// Unknown strings (raw Supabase messages) are returned as-is.
export function translateSharedError(error: string, t: TErrors): string {
  if (!error.startsWith("errors.")) return error;
  const key = error.slice("errors.".length);
  if (!ERROR_KEYS.has(key)) return error;
  return t(key as Parameters<TErrors>[0]);
}
