import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { AvatarUpload } from "@/components/avatar-upload";
import { DisplayNameForm } from "@/components/display-name-form";
import { LanguageForm } from "@/components/language-form";
import { ThemeForm } from "@/components/theme-form";
import { createClient } from "@/lib/supabase/server";
import { resolveTheme } from "@/i18n/theme";

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

  // 実効アバター: users.avatar_url（登録時に OAuth 写真をコピー／カスタムで上書き）> 頭文字。
  // auth メタデータには fallback しない（全メンバー共通の単一ソースに揃える）。
  const effectiveAvatar = profile?.avatar_url ?? null;
  const avatarInitial =
    (profile?.display_name ?? user.email ?? "?").trim().charAt(0).toUpperCase() ||
    "?";

  const [t, currentTheme] = await Promise.all([
    getTranslations("settings"),
    resolveTheme(),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{t("heading")}</h1>

      <div className="mt-10 flex items-center gap-4">
        <AvatarUpload
          userId={user.id}
          currentUrl={effectiveAvatar}
          hasAvatar={Boolean(profile?.avatar_url)}
          initial={avatarInitial}
        />
        <DisplayNameForm defaultValue={profile?.display_name ?? ""} />
      </div>

      <div className="mt-10 space-y-1">
        <label className="block text-sm font-medium">{t("language")}</label>
        <LanguageForm />
      </div>

      <div className="mt-6 space-y-1">
        <label className="block text-sm font-medium">{t("theme")}</label>
        <ThemeForm currentTheme={currentTheme} />
      </div>
    </main>
  );
}
