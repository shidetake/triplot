"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Menu } from "@base-ui/react/menu";

import { LogOutIcon, SettingsIcon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { menuItemClass } from "./menu-item";

// 右上のアカウントメニュー。アバター（Google 写真があれば写真、無ければ頭文字の丸）を
// タップするとドロップダウンで email / 設定 / ログアウト。Apple ログインは写真を返さない
// ので頭文字フォールバックが効く（docs/design-guidelines.md のアバター項）。
// 開閉・外側クリック・Esc・キーボード操作・フォーカスは Base UI Menu に委ねる
// （design-guidelines「部品の作り方」step2＝native 相当の無いメニューは shadcn/Base UI）。
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
  const initial = (name ?? email ?? "?").trim().charAt(0).toUpperCase() || "?";

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  };

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="アカウント"
        title={email ?? "アカウント"}
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-zinc-700 text-sm font-medium text-white ring-1 ring-foreground/10 transition hover:ring-foreground/40"
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
              設定
            </Menu.Item>
            <Menu.Item
              onClick={handleSignOut}
              className={`flex items-center gap-2 text-muted-foreground ${menuItemClass}`}
            >
              <LogOutIcon size={16} />
              ログアウト
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
