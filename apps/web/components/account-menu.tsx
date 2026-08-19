"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Menu } from "@base-ui/react/menu";

import {
  LogOutIcon,
  MessageSquareIcon,
  SettingsIcon,
  ShieldIcon,
} from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { FeedbackForm } from "./feedback-form";
import { SettingsSheet } from "./settings-sheet";
import { type Anchor, FormPopover, NarrowSheet } from "./form-popover";
import { menuItemClass } from "./menu-item";
import { selfAvatarClass } from "./self-avatar";
import { useMediaQuery } from "./use-media-query";
import type { Theme } from "@/i18n/theme";

// 右上のアカウントメニュー。アバター（Google 写真があれば写真、無ければ頭文字の丸）を
// タップすると email / 設定 / ログアウト等が出る。Apple ログインは写真を返さないので
// 頭文字フォールバックが効く（docs/ui-guidelines.md のアバター項）。
//
// 開き方は幅で変える（ui-guidelines「狭い画面ではボトムシート、広い画面では
// タップ位置のポップアップ」）:
//   - 広い画面 … Base UI Menu のドロップダウン（開閉・外側クリック・Esc・
//     キーボード操作・フォーカスを委ねられる）
//   - 狭い画面 … ボトムシート。iOS のアカウントシートと同じ形
// 行の見た目は menuItemClass に集約してあるので、Menu.Item と素の button/Link の
// どちらで描いても揃う。閾値は FormPopover と同じ。
const SHEET_BELOW = "(max-width: 639px)";

export function AccountMenu({
  email,
  name,
  avatarUrl,
  isAdmin,
  openFeedbackCount = 0,
  deployEnv,
  version,
  currentTheme,
  tripMenu,
  tripRows,
}: {
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  // admin のみ: 未対応フィードバック件数（「管理」行のバッジ＋アバターの右上バッジ）。
  openFeedbackCount?: number;
  // デプロイ反映の目視確認用。以前は全ページ共通フッターに常時表示していたが、
  // 一般ユーザーには意味のない文字列を常時見せることになる・狭い画面のタブ
  // レイアウトで表示位置の計算が壊れやすいため撤去し、世の中の慣習
  // （Settings/About 相当）に合わせてここに移した。
  deployEnv: string;
  version: string;
  // 設定シート（テーマ・言語）の初期値。cookie から解決した現在のテーマ。
  currentTheme: Theme;
  // 旅行詳細でだけ差し込まれる旅行の操作（trip-actions.tsx）。ヘッダーを1本に
  // まとめた結果アカウントと旅行の入口が隣り合ったので、旅行の操作はここに
  // 吸収した。ただし意味が違うものを同じ一覧に混ぜないよう、広い画面は
  // サブメニュー（tripMenu）、狭い画面は節見出し付きの一覧（tripRows）にする。
  tripMenu?: ReactNode;
  tripRows?: ReactNode;
}) {
  const router = useRouter();
  const t = useTranslations();
  const narrow = useMediaQuery(SHEET_BELOW);
  const [sheetOpen, setSheetOpen] = useState(false);
  const initial = (name ?? email ?? "?").trim().charAt(0).toUpperCase() || "?";
  // フィードバックフォームはメニュー/シートが閉じた後も生きるよう、この
  // （常駐する）コンポーネントの state で開閉する（create-trip-button と同じ
  // anchor パターン）。
  const [feedbackAnchor, setFeedbackAnchor] = useState<Anchor | null>(null);
  // 設定もページ遷移でなくオーバーレイで開く（元の画面に戻れるように）。
  const [settingsAnchor, setSettingsAnchor] = useState<Anchor | null>(null);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  };

  const avatarFace = avatarUrl ? (
    // 外部（Google）のアバター URL。next/image のドメイン設定を増やさず素の img で。
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
  ) : (
    initial
  );
  const avatarClass = `${selfAvatarClass} h-8 w-8 text-sm transition hover:ring-foreground/40`;
  // admin の未対応フィードバック（受信箱バッジと同型）。開かなくても気づけるように。
  const adminBadge = isAdmin && openFeedbackCount > 0 && (
    <span className="pointer-events-none absolute -right-1 -top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground ring-1 ring-white">
      {openFeedbackCount > 9 ? "9+" : openFeedbackCount}
    </span>
  );

  const emailRow = email && (
    <div className="truncate border-b border-foreground/5 px-3 py-2 text-xs text-muted-foreground">
      {email}
    </div>
  );
  const versionRow = (
    <div className="truncate border-t border-foreground/5 px-3 py-1.5 text-[10px] text-subtle-foreground">
      {deployEnv} · {version}
    </div>
  );
  // ラベルは foreground・アイコンだけ muted（shadcn/ui の DropdownMenu と同じ配色）。
  const rowClass = `flex items-center gap-2 ${menuItemClass}`;
  // ログアウトは元に戻せる操作だが、世の中一般のアプリの慣例に合わせて
  // destructive の赤にする。旅行削除メニューと同じ配色（trip-actions.tsx 参照）。
  const signOutClass =
    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-600/10";

  const adminCountBadge = openFeedbackCount > 0 && (
    <span className="ml-auto flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground">
      {openFeedbackCount > 9 ? "9+" : openFeedbackCount}
    </span>
  );

  const settingsHost = settingsAnchor && (
    <FormPopover
      anchor={settingsAnchor}
      onClose={() => setSettingsAnchor(null)}
      label={t("settings.heading")}
      fullScreenOnNarrow
    >
      <SettingsSheet currentTheme={currentTheme} />
    </FormPopover>
  );

  const feedbackHost = feedbackAnchor && (
    <FormPopover
      anchor={feedbackAnchor}
      onClose={() => setFeedbackAnchor(null)}
      label={t("feedback.heading")}
      fullScreenOnNarrow
      draftKey="feedback"
    >
      <FeedbackForm onDone={() => setFeedbackAnchor(null)} />
    </FormPopover>
  );

  if (narrow) {
    return (
      <>
        <span className="relative inline-flex">
          <button
            type="button"
            aria-label={t("account.account")}
            title={email ?? t("account.account")}
            onClick={() => setSheetOpen(true)}
            className={avatarClass}
          >
            {avatarFace}
          </button>
          {adminBadge}
        </span>
        {sheetOpen && (
          <NarrowSheet
            label={t("account.account")}
            onClose={() => setSheetOpen(false)}
          >
            <div className="pb-2 text-sm">
              {emailRow}
              {tripRows}
              {tripRows && <div className="my-1 border-t border-foreground/5" />}
              <button
                type="button"
                onClick={(e) => {
                  setSheetOpen(false);
                  setSettingsAnchor({ x: e.clientX, y: e.clientY });
                }}
                className={rowClass}
              >
                <SettingsIcon size={16} className="text-muted-foreground" />
                {t("settings.heading")}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  setSheetOpen(false);
                  setFeedbackAnchor({ x: e.clientX, y: e.clientY });
                }}
                className={rowClass}
              >
                <MessageSquareIcon size={16} className="text-muted-foreground" />
                {t("feedback.menuLink")}
              </button>
              {isAdmin && (
                <Link href="/admin" className={rowClass}>
                  <ShieldIcon size={16} className="text-muted-foreground" />
                  {t("admin.menuLink")}
                  {adminCountBadge}
                </Link>
              )}
              <button
                type="button"
                onClick={handleSignOut}
                className={signOutClass}
              >
                <LogOutIcon size={16} />
                {t("account.signOut")}
              </button>
              {versionRow}
            </div>
          </NarrowSheet>
        )}
        {settingsHost}
        {feedbackHost}
      </>
    );
  }

  return (
    <>
      <Menu.Root>
        {/* アバターは overflow-hidden なので、バッジは relative な外側に重ねる。 */}
        <span className="relative inline-flex">
          <Menu.Trigger
            aria-label={t("account.account")}
            title={email ?? t("account.account")}
            className={avatarClass}
          >
            {avatarFace}
          </Menu.Trigger>
          {adminBadge}
        </span>

        <Menu.Portal>
          <Menu.Positioner align="end" sideOffset={8} className="z-50">
            <Menu.Popup className="w-56 overflow-hidden rounded-md border border-foreground/10 bg-background py-1 shadow-lg">
              {emailRow}
              {tripMenu && (
                <>
                  {tripMenu}
                  <div className="my-1 border-t border-foreground/5" />
                </>
              )}
              <Menu.Item
                onClick={(e) =>
                  setSettingsAnchor({ x: e.clientX, y: e.clientY })
                }
                className={rowClass}
              >
                <SettingsIcon size={16} className="text-muted-foreground" />
                {t("settings.heading")}
              </Menu.Item>
              <Menu.Item
                onClick={(e) =>
                  setFeedbackAnchor({ x: e.clientX, y: e.clientY })
                }
                className={rowClass}
              >
                <MessageSquareIcon size={16} className="text-muted-foreground" />
                {t("feedback.menuLink")}
              </Menu.Item>
              {isAdmin && (
                <Menu.Item render={<Link href="/admin" />} className={rowClass}>
                  <ShieldIcon size={16} className="text-muted-foreground" />
                  {t("admin.menuLink")}
                  {adminCountBadge}
                </Menu.Item>
              )}
              <Menu.Item onClick={handleSignOut} className={signOutClass}>
                <LogOutIcon size={16} />
                {t("account.signOut")}
              </Menu.Item>
              {versionRow}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      {settingsHost}
      {feedbackHost}
    </>
  );
}
