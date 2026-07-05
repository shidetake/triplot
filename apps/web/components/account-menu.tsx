"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Menu } from "@base-ui/react/menu";

import {
  LogOutIcon,
  MessageSquareIcon,
  SettingsIcon,
  ShieldIcon,
} from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { FeedbackForm } from "./feedback-form";
import { type Anchor, FormPopover } from "./form-popover";
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
  isAdmin,
  openFeedbackCount = 0,
}: {
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  // admin のみ: 未対応フィードバック件数（「管理」行のバッジ＋アバターの右上バッジ）。
  openFeedbackCount?: number;
}) {
  const router = useRouter();
  const t = useTranslations();
  const initial = (name ?? email ?? "?").trim().charAt(0).toUpperCase() || "?";
  // フィードバックフォームはメニューが閉じた後も生きるよう、この（常駐する）
  // コンポーネントの state で開閉する（create-trip-button と同じ anchor パターン）。
  const [feedbackAnchor, setFeedbackAnchor] = useState<Anchor | null>(null);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  };

  return (
    <>
      <Menu.Root>
        {/* アバターは overflow-hidden なので、バッジは relative な外側に重ねる。 */}
        <span className="relative inline-flex">
          <Menu.Trigger
            aria-label={t("account.account")}
            title={email ?? t("account.account")}
            className={`${selfAvatarClass} h-8 w-8 text-sm transition hover:ring-foreground/40`}
          >
            {avatarUrl ? (
              // 外部（Google）のアバター URL。next/image のドメイン設定を増やさず素の img で。
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              initial
            )}
          </Menu.Trigger>
          {/* admin の未対応フィードバック（受信箱バッジと同型）。メニューを開かなくても気づけるように。 */}
          {isAdmin && openFeedbackCount > 0 && (
            <span className="pointer-events-none absolute -right-1 -top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground ring-1 ring-white">
              {openFeedbackCount > 9 ? "9+" : openFeedbackCount}
            </span>
          )}
        </span>

        <Menu.Portal>
          <Menu.Positioner align="end" sideOffset={8} className="z-50">
            <Menu.Popup className="w-56 overflow-hidden rounded-md border border-foreground/10 bg-background py-1 shadow-lg">
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
                onClick={(e) =>
                  setFeedbackAnchor({ x: e.clientX, y: e.clientY })
                }
                className={`flex items-center gap-2 text-muted-foreground ${menuItemClass}`}
              >
                <MessageSquareIcon size={16} />
                {t("feedback.menuLink")}
              </Menu.Item>
              {isAdmin && (
                <Menu.Item
                  render={<Link href="/admin" />}
                  className={`flex items-center gap-2 text-muted-foreground ${menuItemClass}`}
                >
                  <ShieldIcon size={16} />
                  {t("admin.menuLink")}
                  {openFeedbackCount > 0 && (
                    <span className="ml-auto flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground">
                      {openFeedbackCount > 9 ? "9+" : openFeedbackCount}
                    </span>
                  )}
                </Menu.Item>
              )}
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

      {feedbackAnchor && (
        <FormPopover
          anchor={feedbackAnchor}
          onClose={() => setFeedbackAnchor(null)}
          label={t("feedback.heading")}
          fullScreenOnNarrow
          draftKey="feedback"
        >
          <FeedbackForm onDone={() => setFeedbackAnchor(null)} />
        </FormPopover>
      )}
    </>
  );
}
