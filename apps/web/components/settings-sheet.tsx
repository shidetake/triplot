"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { AvatarUpload } from "@/components/avatar-upload";
import { DeleteAccountButton } from "@/components/delete-account-button";
import { DisplayNameForm } from "@/components/display-name-form";
import { LanguageForm } from "@/components/language-form";
import { ThemeForm } from "@/components/theme-form";
import { createClient } from "@/lib/supabase/client";
import type { Theme } from "@/i18n/theme";

// 設定の中身（アバター・既定の表示名・テーマ・言語）。
//
// 以前は /settings のページだったが、アカウントメニューから開くシート／
// ポップオーバーに変えた。ページ遷移だと元の画面（旅行詳細など）に戻る道が
// 無くなるため（ui-guidelines「ヘッダーから開くものはページ遷移でなく
// オーバーレイ」）。iOS もアカウントのシートの中に置いている。
//
// テーマ・言語は web だけ（iOS は OS 設定に追従）。
// → docs/design/platform-parity.md
export function SettingsSheet({ currentTheme }: { currentTheme: Theme }) {
  const t = useTranslations("settings");
  const [profile, setProfile] = useState<{
    userId: string;
    avatarUrl: string | null;
    displayName: string;
    initial: string;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("users")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .single();
      if (!alive) return;
      const displayName = data?.display_name ?? "";
      setProfile({
        userId: user.id,
        // 実効アバター: users.avatar_url（登録時に OAuth 写真をコピー／カスタムで
        // 上書き）> 頭文字。auth メタデータには fallback しない（全メンバー共通の
        // 単一ソースに揃える）。
        avatarUrl: data?.avatar_url ?? null,
        displayName,
        initial:
          (displayName || user.email || "?").trim().charAt(0).toUpperCase() ||
          "?",
      });
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    // 幅とスクロールは器（FormPopover / NarrowSheet）が持つ。
    <div className="space-y-6 p-4">
      <h2 className="text-lg font-semibold">{t("heading")}</h2>

      {profile ? (
        <div className="flex items-center gap-4">
          <AvatarUpload
            userId={profile.userId}
            currentUrl={profile.avatarUrl}
            hasAvatar={Boolean(profile.avatarUrl)}
            initial={profile.initial}
          />
          <DisplayNameForm defaultValue={profile.displayName} />
        </div>
      ) : (
        <div className="flex items-center gap-4" aria-hidden>
          <div className="h-16 w-16 rounded-full bg-foreground/10" />
          <div className="h-9 flex-1 rounded-md bg-foreground/10" />
        </div>
      )}

      <div className="space-y-1">
        <label className="block text-sm font-medium">{t("theme")}</label>
        <ThemeForm currentTheme={currentTheme} />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium">{t("language")}</label>
        <LanguageForm />
      </div>

      {/* 取り消せない操作なので、他の設定と区切り線で隔てて一番下に置く。 */}
      <div className="border-t border-foreground/10 pt-6">
        <DeleteAccountButton />
      </div>
    </div>
  );
}
