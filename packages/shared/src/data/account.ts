import type { DB } from "./client";
import { err, ok, type Result } from "./result";

// 既定の表示名（users.display_name）を更新。空ならクリア（null→Google 名にフォールバック）。
// RLS の users_self_update（id = auth.uid()）で本人の行だけ更新できる。
export async function updateDisplayName(
  sb: DB,
  userId: string,
  name: string,
): Promise<Result<void>> {
  const { error } = await sb
    .from("users")
    .update({ display_name: name.trim() || null })
    .eq("id", userId);
  if (error) return err(error.message);
  return ok(undefined);
}
