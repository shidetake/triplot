"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

import {
  CalendarDaysIcon,
  ListTodoIcon,
  MapIcon,
  WalletIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "schedule", Icon: CalendarDaysIcon },
  { key: "places", Icon: MapIcon },
  { key: "expenses", Icon: WalletIcon },
  { key: "todos", Icon: ListTodoIcon },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function isTabKey(value: string | null): value is TabKey {
  return TABS.some((tab) => tab.key === value);
}

// 初期タブを ?tab= から読む。useSyncExternalStore で SSR/初期クライアント描画は
// 常に "schedule"（getServerSnapshot）に揃え、hydration 後にブラウザの実際の
// URL（getSnapshot）へ React 側で安全に切り替える（useEffect 内で setState する
// 自前実装だと cascading render になるため、外部システム同期用のこのフックに乗せる）。
function subscribeToUrl(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}
function getUrlTab(): TabKey {
  const param = new URLSearchParams(window.location.search).get("tab");
  return isTabKey(param) ? param : "schedule";
}
function getServerTab(): TabKey {
  return "schedule";
}

// 狭い画面のクロムの実測高。AppHeader(h-12=48px+border1px=49px) + 圧縮ヘッダー
// (h-11=44px+border1px=45px) = 94px。下部タブバーは 58px（内訳: 24pxアイコン+
// 2px gap+約12px ラベル行+py-2=16px+1px border）＋ セーフエリア。
const TOP_OFFSET = "94px";
const BOTTOM_OFFSET = "calc(58px + env(safe-area-inset-bottom))";

// 狭い画面（< md=768px）だけタブ化し、広い画面は今までどおり全セクション縦積み
// （旅行詳細のコンテナ幅 max-w-3xl=768px を下回ると縦積みの同時表示の旨味が
// 落ちるため、そこで切り替える）。表示の出し分けは Tailwind の
// "hidden md:block" だけで行い、JS のメディアクエリ判定は使わない
// （SSR とクライアントの初期描画を一致させ hydration mismatch を避ける）。
//
// タブ切替は実ナビゲーションにしない（案B）: 4セクションは常にマウントされたまま
// CSS で表示/非表示するだけなので、地図インスタンス・スクロール位置・入力途中の
// フォームが切替をまたいで生き続ける。URL 同期は history.replaceState のみで
// 行い、Next.js のルーターは経由しない（戻るボタンでタブ履歴が積まれない）。
export function TripDetailTabs({
  schedule,
  places,
  expenses,
  todos,
}: Record<TabKey, React.ReactNode>) {
  const t = useTranslations("tripTabs");
  const urlTab = useSyncExternalStore(subscribeToUrl, getUrlTab, getServerTab);
  // クリックによる切替はここでだけ上書きする（URL 変化の反映は urlTab に任せる）。
  const [overrideTab, setOverrideTab] = useState<TabKey | null>(null);
  const activeTab = overrideTab ?? urlTab;

  const selectTab = (key: TabKey) => {
    setOverrideTab(key);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    window.history.replaceState(null, "", url);
  };

  const content: Record<TabKey, React.ReactNode> = {
    schedule,
    places,
    expenses,
    todos,
  };

  return (
    <>
      {/* 狭い画面でだけ下の固定タブバー分の余白を確保。広い画面は不要（タブバー非表示）。 */}
      <div className="pb-24 md:pb-0">
        {TABS.map(({ key }) => {
          const active = key === activeTab;
          // 場所タブだけ、狭い画面では地図を画面いっぱいに見せるため通常の文書
          // フローから外し、ヘッダー〜タブバーの間を埋める固定パネルにする
          // （Google マップ風）。広い画面は他タブと同じ通常フローに戻す。
          if (key === "places") {
            return (
              <div
                key={key}
                style={
                  active
                    ? { top: TOP_OFFSET, bottom: BOTTOM_OFFSET }
                    : undefined
                }
                className={cn(
                  active ? "fixed inset-x-0 z-10" : "hidden",
                  "md:static md:inset-auto md:block",
                )}
              >
                {content[key]}
              </div>
            );
          }
          return (
            <div
              key={key}
              className={cn(active ? "block" : "hidden", "md:block")}
            >
              {content[key]}
            </div>
          );
        })}
      </div>

      <nav
        aria-label={t("navLabel")}
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-foreground/10 bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {TABS.map(({ key, Icon }) => {
          const active = key === activeTab;
          return (
            <button
              key={key}
              type="button"
              onClick={() => selectTab(key)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <Icon size={24} />
              <span>{t(key)}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
