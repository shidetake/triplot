"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Menu } from "@base-ui/react/menu";

import { LogOutIcon, SettingsIcon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { menuItemClass } from "./menu-item";
import { selfAvatarClass } from "./self-avatar";

// 右上のアカウントメニュー。アバター（Google 写真があれば写真、無ければ頭文字の丸）を
// タップするとドロップダウンで email / 設定 / ログアウト。Apple ログインは写真を返さない
// ので頭文字フォールバックが効く（docs/ui-guidelines.md のアバター項）。
// 開閉・外側クリック・Esc・キーボード操作・フォーカスは Base UI Menu に委ねる
// （ui-guidelines「部品の作り方」step2＝native 相当の無いメニューは shadcn/Base UI）。
export function AccountMenu({
  email,
  name,
  avatarUrl,
}: {
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const t = useTranslations();
  const initial = (name ?? email ?? "?").trim().charAt(0).toUpperCase() || "?";

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  };

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={t("account.account")}
        title={email ?? t("account.account")}
        className={`${selfAvatarClass} h-8 w-8 text-sm transition hover:ring-foreground/40`}
      >
        {avatarUrl ? (
          // 外部（Google）のアバター URL。next/image のドメイン設定を増やさず素の img で。
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={8} className="z-50">
          <Menu.Popup className="w-56 overflow-hidden rounded-md border border-foreground/10 bg-white py-1 shadow-lg">
            {email && (
              <div className="truncate border-b border-foreground/5 px-3 py-2 text-xs text-muted-foreground">
                {email}
              </div>
            )}
            <Menu.Item
              render={<Link href="/settings" />}
              className={`flex items-center gap-2 text-muted-foreground ${menuItemClass}`}
            >
              <SettingsIcon size={16} />
              {t("settings.heading")}
            </Menu.Item>
            <Menu.Item
              onClick={handleSignOut}
              className={`flex items-center gap-2 text-muted-foreground ${menuItemClass}`}
            >
              <LogOutIcon size={16} />
              {t("account.signOut")}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
