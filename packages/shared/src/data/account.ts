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

// auth.users 作成時に SQL トリガー handle_new_user が raw_user_meta_data から
// display_name/avatar_url を1回だけ埋める（同ファイル内 handle_new_user 参照）。
// だがそのトリガーは auth.users への INSERT でしか発火しない。Apple サインアップ
// （名前・写真を返さないことが多い）で先に空のままアカウントができ、後日 同じ
// メールアドレスで Google にサインインして自動リンクされた場合、auth.users は
// 増えず auth.identities が増えるだけなので、Apple 時点で空だった項目は
// 何もしないと永久に空のまま残る。この関数はそのすき間を埋める。
type IdentityLike = { identity_data?: Record<string, unknown> | null };

// 半角/全角スペース区切りの先頭トークン（handle_new_user の SQL と同じ規則）。
function firstToken(s: string): string | null {
  const m = s.trim().match(/^[^\s　]+/);
  return m ? m[0] : null;
}

// 複数 identity（Apple・Google 等）から使えそうな表示名/アバターを拾う純粋関数。
// 項目ごとに独立して最初に見つかったものを採用する（例: 表示名は Google 由来・
// アバターは別 identity 由来、でも構わない）。既存データを上書きするかどうかの
// 判断はしない＝呼び出し側（backfillProfileFromIdentities）が空の項目にだけ当てる。
export function pickProfileFromIdentities(
  identities: IdentityLike[] | null | undefined,
): { displayName: string | null; avatarUrl: string | null } {
  let displayName: string | null = null;
  let avatarUrl: string | null = null;
  for (const identity of identities ?? []) {
    const data = identity.identity_data ?? {};
    if (!displayName) {
      const raw =
        (typeof data.name === "string" && data.name) ||
        (typeof data.full_name === "string" && data.full_name) ||
        "";
      if (raw.trim()) displayName = firstToken(raw);
    }
    if (!avatarUrl) {
      const raw =
        (typeof data.avatar_url === "string" && data.avatar_url) ||
        (typeof data.picture === "string" && data.picture) ||
        "";
      if (raw) avatarUrl = raw;
    }
  }
  return { displayName, avatarUrl };
}

// サインイン成功のたびに呼んで構わない（web の auth callback・RN の
// signInWithGoogle/signInWithApple 直後）。display_name・avatar_url は
// 「既に何か入っていたら触らない」項目ごとの判定なので、ユーザーが後から
// 自分で変えた値を Apple/Google の値で上書きすることはない。何も埋める
// ものが無ければ SELECT だけで終わる（無駄な UPDATE を発行しない）。
export async function backfillProfileFromIdentities(
  sb: DB,
  userId: string,
  identities: IdentityLike[] | null | undefined,
): Promise<Result<void>> {
  const { displayName, avatarUrl } = pickProfileFromIdentities(identities);
  if (!displayName && !avatarUrl) return ok(undefined);

  const { data: profile, error: readError } = await sb
    .from("users")
    .select("display_name, avatar_url")
    .eq("id", userId)
    .single();
  if (readError) return err(readError.message);

  const patch: { display_name?: string; avatar_url?: string } = {};
  if (!profile?.display_name && displayName) patch.display_name = displayName;
  if (!profile?.avatar_url && avatarUrl) patch.avatar_url = avatarUrl;
  if (Object.keys(patch).length === 0) return ok(undefined);

  const { error: updateError } = await sb
    .from("users")
    .update(patch)
    .eq("id", userId);
  if (updateError) return err(updateError.message);
  return ok(undefined);
}

// アカウントの削除（App Store Review Guideline 5.1.1(v)）。
//
// 本体は delete_account() RPC が1トランザクションでやる。ここが持つのは
// **アバターの削除だけ**で、これは Supabase が storage.objects への直接 DELETE を
// 禁じており（Storage API 経由でしか消せない）RPC の中に入れられないため。
//
// 順序は「アバター → RPC」。先にアバターを消すのは、失敗したら中断して
// アカウントを残せるから。逆順だと、消えたアカウントのアバターだけが
// バケットに取り残される。
export async function deleteAccount(
  sb: DB,
  userId: string,
): Promise<Result<void>> {
  const { data: files, error: listError } = await sb.storage
    .from("avatars")
    .list(userId);
  if (listError) return err(listError.message);

  if (files && files.length > 0) {
    const { error } = await sb.storage
      .from("avatars")
      .remove(files.map((f) => `${userId}/${f.name}`));
    if (error) return err(error.message);
  }

  const { error } = await sb.rpc("delete_account");
  if (error) return err(error.message);
  return ok(undefined);
}
