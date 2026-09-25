// ログイン方法（Google / Apple）の追加まわりの共通部品。web と iOS の設定の
// 「ログイン方法」欄から使う。
//
// 足すだけで、アカウントの統合（中身の移し替え）はしない。その Google / Apple で
// 既に別のアカウントがある場合、Supabase が追加を断るので、それを見分けて
// 案内を出す（BACKLOG 16。統合しない理由は判断の記録を参照）。

export type LoginProvider = "google" | "apple";

// 設定の欄に並べる順。
export const LOGIN_PROVIDERS: readonly LoginProvider[] = ["google", "apple"];

// アカウントに付いているログイン方法。Supabase のユーザーが持つ identities から
// 取り出す（知らない種類は無視する）。
export function linkedProviders(
  identities: readonly { provider?: string | null }[] | null | undefined,
): Set<LoginProvider> {
  const out = new Set<LoginProvider>();
  for (const i of identities ?? []) {
    if (i.provider === "google" || i.provider === "apple") out.add(i.provider);
  }
  return out;
}

// 追加に失敗した理由。
// - already_used: その Google / Apple で既に別のアカウントがある（案内を出す）
// - other: それ以外（通信・設定の不備など）
export type LinkFailure = "already_used" | "other";

// Supabase が返すエラーを見分ける。web はリダイレクトで戻ってきた URL の
// error_code、iOS は例外の code に同じ値が入る。
export function classifyLinkError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): LinkFailure {
  if (error?.code === "identity_already_exists") return "already_used";
  // code が付かない経路の保険（文言は Supabase の既定）。
  if (/already linked to another user/i.test(error?.message ?? "")) {
    return "already_used";
  }
  return "other";
}
