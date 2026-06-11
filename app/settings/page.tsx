import { redirect } from "next/navigation";

import { AvatarUpload } from "@/components/avatar-upload";
import { DisplayNameForm } from "@/components/display-name-form";
import { createClient } from "@/lib/supabase/server";

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
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">設定</h1>

      <div className="mt-10 flex items-center gap-4">
        <AvatarUpload
          userId={user.id}
          currentUrl={effectiveAvatar}
          hasCustom={Boolean(profile?.avatar_url)}
          initial={avatarInitial}
        />
        <DisplayNameForm defaultValue={profile?.display_name ?? ""} />
      </div>
    </main>
  );
}
