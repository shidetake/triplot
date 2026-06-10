import Link from "next/link";
import { redirect } from "next/navigation";

import { AvatarUpload } from "@/components/avatar-upload";
import { HelpTip } from "@/components/help-tip";
import { SaveIcon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";

import { updateDisplayNameAction } from "./actions";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // 既定の表示名（旅行作成/参加時のデフォルト）＋ カスタムアバター。
  const { data: profile } = await supabase
    .from("users")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .single();

  // 実効アバター: カスタム > Google の写真 > 頭文字。
  const googleAvatar =
    (user.user_metadata?.avatar_url as string | undefined) ??
    (user.user_metadata?.picture as string | undefined) ??
    null;
  const effectiveAvatar = profile?.avatar_url ?? googleAvatar;
  const avatarInitial =
    (profile?.display_name ?? user.email ?? "?").trim().charAt(0).toUpperCase() ||
    "?";

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">設定</h1>
        <Link
          href="/"
          className="text-sm text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline"
        >
          ← ホーム
        </Link>
      </header>

      <div className="mt-10 flex items-center gap-4">
        <AvatarUpload
          userId={user.id}
          currentUrl={effectiveAvatar}
          hasCustom={Boolean(profile?.avatar_url)}
          initial={avatarInitial}
        />
        <form
          action={updateDisplayNameAction}
          className="flex flex-1 items-center gap-2"
        >
          <input
            type="text"
            name="display_name"
            defaultValue={profile?.display_name ?? ""}
            placeholder="名前"
            maxLength={50}
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none"
          />
          <HelpTip label="デフォルト表示名について" align="right">
            旅行に参加するときのデフォルト表示名です（既存の旅行の表示名は変わりません）。
          </HelpTip>
          <button
            type="submit"
            aria-label="保存"
            title="保存"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-black text-white transition hover:bg-zinc-800"
          >
            <SaveIcon size={18} />
          </button>
        </form>
      </div>
    </main>
  );
}
